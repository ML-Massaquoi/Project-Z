"""
Project Z - Device Queue Manager

Central architecture for ZKTeco device TCP communication.
Enforces the "one TCP connection per device" constraint using
per-device workers with priority job queues.

Architecture:
  DeviceQueueManager (singleton)
    └─ DeviceWorker[device_ip]
         ├─ asyncio.PriorityQueue[DeviceJob]
         ├─ Single ZKSDKService (owns TCP connection)
         └─ State machine (idle/busy/paused/offline/error)

Usage:
  manager = DeviceQueueManager.get_instance()
  await manager.enqueue(device_ip, JobPriority.ATTENDANCE_POLL, "get_attendance", ...)
  result = await manager.enqueue_and_wait(device_ip, JobPriority.ENROLLMENT, "enroll_user", ...)
"""

import asyncio
import enum
import logging
import socket
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Callable, Coroutine, Optional

from app.services.sdk_service import ZKSDKService

logger = logging.getLogger(__name__)


class JobPriority(enum.IntEnum):
    """Priority levels for device jobs. Higher value = more urgent.

    Enrollment and user management must preempt background polling to
    avoid "device busy" errors during interactive operations.
    """
    HEARTBEAT = 10
    STATISTICS = 15
    ATTENDANCE_POLL = 20
    GET_DEVICE_INFO = 25
    SET_TIME = 30
    HEALTH_CHECK = 35
    FULL_SYNC = 40
    SYNC_TEMPLATES = 45
    SYNC_USERS = 50
    DOWNLOAD_ATTENDANCE = 55
    DOWNLOAD_TEMPLATE = 60
    UPLOAD_TEMPLATE = 65
    DOWNLOAD_USER = 70
    UPLOAD_USER = 80
    DELETE_EMPLOYEE = 90
    CANCEL_ENROLLMENT = 95
    ENROLLMENT = 100


class DeviceState(enum.Enum):
    IDLE = "idle"
    BUSY = "busy"
    PAUSED = "paused"
    OFFLINE = "offline"
    ERROR = "error"


@dataclass(eq=False)
class DeviceJob:
    """A unit of work for a device worker.

    Uses manual __lt__ for PriorityQueue ordering:
      - Higher priority (100) before lower priority (10)
      - Earlier created_at before later created_at (FIFO within same priority)

    For async result waiting, the caller can use `wait_for_result()`.
    """
    job_type: str = field(compare=False)
    device_ip: str = field(compare=False)
    priority: int = field(compare=False)
    created_at: float = field(default_factory=time.time, compare=False)
    payload: dict = field(default_factory=dict, compare=False)
    job_id: str = field(default_factory=lambda: str(uuid.uuid4()), compare=False)
    result: Any = field(default=None, compare=False)
    result_event: asyncio.Event = field(
        default_factory=asyncio.Event,
        compare=False,
    )

    def __lt__(self, other):
        """Higher priority first; for ties, earlier created_at first."""
        if not isinstance(other, DeviceJob):
            return NotImplemented
        if self.priority != other.priority:
            return self.priority > other.priority
        return self.created_at < other.created_at

    async def wait_for_result(self, timeout: float | None = None) -> Any:
        """Wait for the job to complete and return the result."""
        await asyncio.wait_for(self.result_event.wait(), timeout=timeout)
        return self.result

    def __repr__(self) -> str:
        return (
            f"DeviceJob(id={self.job_id[:8]}, type={self.job_type}, "
            f"priority={self.priority}, ip={self.device_ip})"
        )


class DeviceWorker:
    """Owns the single TCP connection for a device and processes its job queue.

    One worker per device IP. The worker:
    - Maintains a single persistent ZKSDKService instance (owns TCP conn)
    - Processes jobs from an asyncio.PriorityQueue in priority order
    - Checks for higher-priority interrupts during long-running sync jobs
    - Tracks device state (idle/busy/paused/offline/error)
    - Reconnects automatically on connection errors
    """

    def __init__(
        self,
        device_ip: str,
        port: int = 4370,
        timeout: int = 10,
        password: int = 0,
        interrupt_check_interval: float = 1.0,
    ):
        self.device_ip = device_ip
        self.port = port
        self.timeout = timeout
        self.password = password
        self._queue: asyncio.PriorityQueue[DeviceJob] = asyncio.PriorityQueue()
        self._state = DeviceState.IDLE
        self._sdk: Optional[ZKSDKService] = None
        self._task: Optional[asyncio.Task] = None
        self._current_job: Optional[DeviceJob] = None
        self._interrupt_check_interval = interrupt_check_interval
        self._started = False
        self._last_activity: float = 0.0
        self._idle_timeout: float = 300.0  # Close conn after 5 min idle
        self._error_count: int = 0
        self._max_errors: int = 5
        self._event_handlers: dict[str, list[Callable]] = {}
        self._lock = asyncio.Lock()
        self._paused = asyncio.Event()
        self._paused.set()  # Not paused by default

    # ── Public API ──────────────────────────────────────────────

    @property
    def state(self) -> DeviceState:
        return self._state

    @property
    def current_job(self) -> Optional[DeviceJob]:
        return self._current_job

    @property
    def queue_size(self) -> int:
        return self._queue.qsize()

    @property
    def is_running(self) -> bool:
        return self._started and self._task is not None and not self._task.done()

    def on(self, event: str, handler: Callable) -> None:
        self._event_handlers.setdefault(event, []).append(handler)

    async def start(self) -> None:
        if self._started:
            return
        self._started = True
        self._task = asyncio.create_task(
            self._run_loop(), name=f"device-worker-{self.device_ip}"
        )
        logger.info(
            f"DeviceWorker: Started worker for {self.device_ip}:{self.port}"
        )

    async def stop(self) -> None:
        self._started = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None
        await self._close_sdk()
        self._state = DeviceState.IDLE
        logger.info(f"DeviceWorker: Stopped worker for {self.device_ip}")

    async def enqueue(self, job: DeviceJob) -> None:
        """Add a job to the queue. Returns immediately."""
        await self._queue.put(job)
        logger.debug(f"DeviceWorker {self.device_ip}: Enqueued {job}")

    async def enqueue_front(self, job: DeviceJob) -> None:
        """Add a job with the highest possible priority, effectively front of queue.

        Used for urgent operations like enrollment that must run immediately.
        """
        front_job = DeviceJob(
            priority=JobPriority.ENROLLMENT + 1,
            created_at=0.0,  # Ensure earliest possible ordering
            job_type=job.job_type,
            device_ip=job.device_ip,
            payload=job.payload,
        )
        await self._queue.put(front_job)
        logger.info(f"DeviceWorker {self.device_ip}: Front-queued urgent {job.job_type}")

    # ── Pause/Resume (for exclusive access) ─────────────────────

    async def pause(self) -> None:
        """Pause the worker. Exists running loop after current job."""
        self._paused.clear()
        logger.debug(f"DeviceWorker {self.device_ip}: Paused")

    async def resume(self) -> None:
        """Resume the worker's queue processing loop."""
        self._paused.set()
        logger.debug(f"DeviceWorker {self.device_ip}: Resumed")

    # ── Event Emission ──────────────────────────────────────────

    def _emit(self, event: str, **data: Any) -> None:
        for handler in self._event_handlers.get(event, []):
            try:
                handler(device_ip=self.device_ip, **data)
            except Exception as e:
                logger.warning(
                    f"DeviceWorker {self.device_ip}: Event handler error "
                    f"for '{event}': {e}"
                )

    # ── Core Loop ───────────────────────────────────────────────

    async def _run_loop(self) -> None:
        while self._started:
            await self._paused.wait()  # Block while paused for exclusive access
            try:
                job = await self._queue.get()
            except asyncio.CancelledError:
                break

            self._current_job = job
            self._state = DeviceState.BUSY
            self._last_activity = time.time()

            try:
                await self._execute_job(job)
                self._error_count = 0
            except asyncio.CancelledError:
                self._state = DeviceState.PAUSED
                logger.info(
                    f"DeviceWorker {self.device_ip}: Job {job} cancelled"
                )
                self._emit("job_cancelled", job=job)
            except Exception as e:
                self._error_count += 1
                self._state = DeviceState.ERROR
                logger.error(
                    f"DeviceWorker {self.device_ip}: Job {job} failed: {e}",
                    exc_info=True,
                )
                job.result = e
                job.result_event.set()
                self._emit("job_failed", job=job, error=str(e))
            finally:
                self._current_job = None
                self._queue.task_done()

                # Transition to idle/offline based on error count
                if self._state == DeviceState.ERROR:
                    if self._error_count >= self._max_errors:
                        self._state = DeviceState.OFFLINE
                        self._emit("device_offline", reason="max_errors")
                        await self._close_sdk()
                    else:
                        self._state = DeviceState.IDLE
                else:
                    self._state = DeviceState.IDLE

                # Close SDK if idle for too long
                if not self._queue.qsize():
                    idle_duration = time.time() - self._last_activity
                    if idle_duration >= self._idle_timeout:
                        await self._close_sdk()

    # ── Job Execution ───────────────────────────────────────────

    async def _execute_job(self, job: DeviceJob) -> None:
        """Execute a single job with optional interrupt support."""
        handler = self._get_handler(job.job_type)
        if handler is None:
            logger.warning(
                f"DeviceWorker {self.device_ip}: Unknown job type: {job.job_type}"
            )
            return

        sdk = await self._get_or_create_sdk()

        # Long-running sync jobs check for higher-priority interrupts
        if job.job_type in (
            "sync_users",
            "sync_templates",
            "full_sync",
            "get_attendance",
            "get_templates",
            "get_users",
            "push_users",
            "push_templates",
        ):
            await self._run_with_interrupts(handler, sdk, job)
        else:
            result = await handler(sdk, job)
            self._complete_job(job, result)

    def _complete_job(self, job: DeviceJob, result: Any) -> None:
        """Set job result and emit completion event."""
        job.result = result
        job.result_event.set()
        self._emit("job_completed", job=job, result=result)

    async def _run_with_interrupts(
        self,
        handler: Callable,
        sdk: ZKSDKService,
        job: DeviceJob,
    ) -> None:
        """Run a handler with periodic interrupt checks.

        Checks the queue for higher-priority jobs after each chunk.
        If a higher-priority job is waiting, re-queue the current job
        and yield to the higher-priority one.
        """
        while True:
            # Check for higher-priority jobs
            higher_priority_job = await self._peek_higher_priority(job.priority)
            if higher_priority_job is not None:
                logger.info(
                    f"DeviceWorker {self.device_ip}: Interrupting {job.job_type} "
                    f"for higher-priority {higher_priority_job.job_type}"
                )
                # Re-queue current job (reset event for next run)
                job.result_event.clear()
                await self._queue.put(job)
                self._emit("job_interrupted", job=job, by=higher_priority_job)
                return

            # Run one iteration
            done, result = await self._run_handler_with_check(handler, sdk, job)
            if done:
                self._complete_job(job, result)
                return

            await asyncio.sleep(self._interrupt_check_interval)

    async def _peek_higher_priority(
        self, current_priority: int
    ) -> Optional[DeviceJob]:
        """Peek at the queue to see if a higher-priority job exists."""
        if self._queue.empty():
            return None
        try:
            # PriorityQueue orders (priority, timestamp), so get() returns
            # the highest-priority item. We just peek without removing.
            # We use a workaround: pop, check, re-push.
            temp = await self._queue.get()
            if temp.priority > current_priority:
                # Re-queue current item and return it as the higher priority job
                return temp
            else:
                await self._queue.put(temp)
                return None
        except asyncio.CancelledError:
            return None

    async def _run_handler_with_check(
        self,
        handler: Callable,
        sdk: ZKSDKService,
        job: DeviceJob,
    ) -> tuple[bool, Any]:
        """Run handler in thread executor and return (done, result)."""
        loop = asyncio.get_running_loop()
        try:
            result = await loop.run_in_executor(None, handler, sdk, job)
            return (True, result)
        except Exception as e:
            if "device busy" in str(e).lower():
                # Device is busy (likely enrollment) — re-queue and yield
                logger.info(
                    f"DeviceWorker {self.device_ip}: Device busy, "
                    f"re-queuing {job.job_type}"
                )
                return (False, None)
            raise

    def _get_handler(self, job_type: str) -> Optional[Callable]:
        handlers: dict[str, Callable] = {
            "get_users": self._handle_get_users,
            "set_user": self._handle_set_user,
            "delete_user": self._handle_delete_user,
            "get_attendance": self._handle_get_attendance,
            "get_templates": self._handle_get_templates,
            "save_user_template": self._handle_save_user_template,
            "enroll_user": self._handle_enroll_user,
            "enroll_face": self._handle_enroll_face,
            "set_time": self._handle_set_time,
            "get_device_info": self._handle_get_device_info,
            "test_connection": self._handle_test_connection,
            "restart": self._handle_restart,
            "clear_data": self._handle_clear_data,
            "get_serialnumber": self._handle_get_serialnumber,
            "sync_users": self._handle_get_users,
            "sync_templates": self._handle_get_templates,
            "full_sync": self._handle_full_sync,
            "push_users": self._handle_push_users,
            "push_templates": self._handle_push_templates,
            "delete_user_template": self._handle_delete_user_template,
            "get_firmware_version": self._handle_get_firmware_version,
        }
        return handlers.get(job_type)

    # ── SDK Connection Management ───────────────────────────────

    async def _get_or_create_sdk(self) -> ZKSDKService:
        if self._sdk is None:
            self._sdk = ZKSDKService(
                ip=self.device_ip,
                port=self.port,
                timeout=self.timeout,
                password=self.password,
            )
            loop = asyncio.get_running_loop()
            try:
                await loop.run_in_executor(
                    None, self._sdk._connect_with_retry
                )
                logger.info(
                    f"DeviceWorker {self.device_ip}: SDK connected"
                )
            except Exception as e:
                logger.error(
                    f"DeviceWorker {self.device_ip}: SDK connect failed: {e}"
                )
                self._sdk = None
                raise RuntimeError(
                    f"Cannot connect to device {self.device_ip}: {e}"
                )
        return self._sdk

    async def _close_sdk(self) -> None:
        if self._sdk is not None:
            loop = asyncio.get_running_loop()
            try:
                await loop.run_in_executor(None, self._sdk.disconnect)
            except Exception:
                pass
            self._sdk = None
            logger.debug(f"DeviceWorker {self.device_ip}: SDK disconnected")

    async def health_check(self) -> bool:
        """Quick TCP probe to check if device is reachable."""
        try:
            loop = asyncio.get_running_loop()
            await loop.run_in_executor(
                None,
                lambda: socket.create_connection(
                    (self.device_ip, self.port), timeout=3
                ).close(),
            )
            return True
        except Exception:
            return False

    # ── Job Handlers ────────────────────────────────────────────
    # Each handler receives (sdk, job) and is run in a thread executor.
    # They are synchronous functions that call ZKSDKService methods.

    @staticmethod
    def _handle_get_users(sdk: ZKSDKService, job: DeviceJob) -> list[dict]:
        return sdk.get_users()

    @staticmethod
    def _handle_set_user(sdk: ZKSDKService, job: DeviceJob) -> bool:
        return sdk.set_user(**job.payload)

    @staticmethod
    def _handle_delete_user(sdk: ZKSDKService, job: DeviceJob) -> bool:
        return sdk.delete_user(**job.payload)

    @staticmethod
    def _handle_get_attendance(sdk: ZKSDKService, job: DeviceJob) -> list[dict]:
        return sdk.get_attendance()

    @staticmethod
    def _handle_get_templates(sdk: ZKSDKService, job: DeviceJob) -> list[dict]:
        return sdk.get_templates()

    @staticmethod
    def _handle_save_user_template(sdk: ZKSDKService, job: DeviceJob) -> bool:
        return sdk.save_user_template(**job.payload)

    @staticmethod
    def _handle_enroll_user(sdk: ZKSDKService, job: DeviceJob) -> bool:
        return sdk.enroll_user(**job.payload)

    @staticmethod
    def _handle_enroll_face(sdk: ZKSDKService, job: DeviceJob) -> bool:
        return sdk.enroll_face(**job.payload)

    @staticmethod
    def _handle_set_time(sdk: ZKSDKService, job: DeviceJob) -> bool:
        try:
            import zk
            conn = sdk._get_connection()
            conn.disable_device()
            conn.set_time(job.payload.get("timestamp") if job.payload else None)
            conn.enable_device()
            logger.info(f"SDK: Time synced on {sdk.ip}")
            return True
        except Exception as e:
            logger.error(f"SDK set_time error on {sdk.ip}: {e}")
            return False

    @staticmethod
    def _handle_get_device_info(
        sdk: ZKSDKService, job: DeviceJob
    ) -> dict:
        return sdk.get_device_info()

    @staticmethod
    def _handle_test_connection(
        sdk: ZKSDKService, job: DeviceJob
    ) -> dict:
        return sdk.test_connection()

    @staticmethod
    def _handle_restart(sdk: ZKSDKService, job: DeviceJob) -> bool:
        return sdk.restart()

    @staticmethod
    def _handle_clear_data(sdk: ZKSDKService, job: DeviceJob) -> bool:
        return sdk.clear_data()

    @staticmethod
    def _handle_get_serialnumber(
        sdk: ZKSDKService, job: DeviceJob
    ) -> str:
        return sdk.get_serialnumber()

    @staticmethod
    def _handle_delete_user_template(
        sdk: ZKSDKService, job: DeviceJob
    ) -> bool:
        return sdk.delete_user_template(**job.payload)

    @staticmethod
    def _handle_get_firmware_version(
        sdk: ZKSDKService, job: DeviceJob
    ) -> str:
        return sdk.get_firmware_version()

    @staticmethod
    def _handle_full_sync(
        sdk: ZKSDKService, job: DeviceJob
    ) -> dict:
        """Full sync: get users + get templates."""
        users = sdk.get_users()
        templates = sdk.get_templates()
        return {"users": users, "templates": templates}

    @staticmethod
    def _handle_push_users(
        sdk: ZKSDKService, job: DeviceJob
    ) -> list[bool]:
        """Push multiple users to the device."""
        results = []
        for user_data in job.payload.get("users", []):
            try:
                result = sdk.set_user(**user_data)
                results.append(result)
            except Exception as e:
                logger.error(f"Push user error on {sdk.ip}: {e}")
                results.append(False)
        return results

    @staticmethod
    def _handle_push_templates(
        sdk: ZKSDKService, job: DeviceJob
    ) -> list[bool]:
        """Push multiple templates to the device."""
        results = []
        for tmpl_data in job.payload.get("templates", []):
            try:
                result = sdk.save_user_template(**tmpl_data)
                results.append(result)
            except Exception as e:
                logger.error(f"Push template error on {sdk.ip}: {e}")
                results.append(False)
        return results

    # ── Cleanup ─────────────────────────────────────────────────

    async def __aenter__(self):
        await self.start()
        return self

    async def __aexit__(self, *args: Any) -> None:
        await self.stop()


# ═══════════════════════════════════════════════════════════════════
# Device Queue Manager
# ═══════════════════════════════════════════════════════════════════


class DeviceQueueManager:
    """Singleton manager that owns all DeviceWorker instances.

    Routes jobs to the correct worker by device IP.
    Automatically creates workers on demand.
    """

    _instance: Optional["DeviceQueueManager"] = None
    _lock: asyncio.Lock = asyncio.Lock()

    def __init__(self) -> None:
        self._workers: dict[str, DeviceWorker] = {}
        self._defaults: dict[str, Any] = {
            "port": 4370,
            "timeout": 10,
            "password": 0,
        }
        self._started = False

    @classmethod
    async def get_instance(cls) -> "DeviceQueueManager":
        if cls._instance is None:
            async with cls._lock:
                if cls._instance is None:
                    cls._instance = cls()
        return cls._instance

    @classmethod
    def reset_instance(cls) -> None:
        """Reset singleton (used in tests)."""
        cls._instance = None

    # ── Worker Management ───────────────────────────────────────

    async def get_worker(
        self,
        device_ip: str,
        port: int | None = None,
        timeout: int | None = None,
        password: int | None = None,
    ) -> DeviceWorker:
        """Get or create a worker for the given device IP."""
        if device_ip not in self._workers:
            worker = DeviceWorker(
                device_ip=device_ip,
                port=port or self._defaults["port"],
                timeout=timeout or self._defaults["timeout"],
                password=password or self._defaults["password"],
            )
            self._workers[device_ip] = worker
        return self._workers[device_ip]

    async def start_worker(
        self,
        device_ip: str,
        port: int | None = None,
        timeout: int | None = None,
        password: int | None = None,
    ) -> DeviceWorker:
        """Get or create a worker and start it."""
        worker = await self.get_worker(device_ip, port, timeout, password)
        if not worker.is_running:
            await worker.start()
        return worker

    async def stop_worker(self, device_ip: str) -> None:
        """Stop and remove a worker for a specific device."""
        worker = self._workers.pop(device_ip, None)
        if worker is not None:
            await worker.stop()

    async def stop_all(self) -> None:
        """Stop all workers."""
        for ip in list(self._workers.keys()):
            await self.stop_worker(ip)
        self._workers.clear()

    def get_active_workers(self) -> list[DeviceWorker]:
        return [
            w for w in self._workers.values()
            if w.is_running and w.state not in (DeviceState.OFFLINE, DeviceState.ERROR)
        ]

    def get_states(self) -> dict[str, dict[str, Any]]:
        """Get state of all workers for monitoring/dashboard."""
        return {
            ip: {
                "state": worker.state.value,
                "queue_size": worker.queue_size,
                "current_job": (
                    worker.current_job.job_type if worker.current_job else None
                ),
                "is_running": worker.is_running,
            }
            for ip, worker in self._workers.items()
        }

    # ── Job Routing ─────────────────────────────────────────────

    async def enqueue(
        self,
        device_ip: str,
        priority: int,
        job_type: str,
        payload: dict | None = None,
    ) -> DeviceJob:
        """Enqueue a job for a device. Worker is auto-started if needed."""
        worker = await self.start_worker(device_ip)
        job = DeviceJob(
            priority=priority,
            job_type=job_type,
            device_ip=device_ip,
            payload=payload or {},
        )
        await worker.enqueue(job)
        logger.info(f"DeviceQueueManager: Enqueued {job}")
        return job

    async def enqueue_front(
        self,
        device_ip: str,
        job_type: str,
        payload: dict | None = None,
    ) -> DeviceJob:
        """Enqueue a high-urgency job (front of queue)."""
        worker = await self.start_worker(device_ip)
        job = DeviceJob(
            priority=JobPriority.ENROLLMENT + 1,
            created_at=0.0,
            job_type=job_type,
            device_ip=device_ip,
            payload=payload or {},
        )
        await worker.enqueue(job)
        logger.info(f"DeviceQueueManager: Front-enqueued urgent {job_type}")
        return job

    async def run_sdk_operations(
        self,
        device_ip: str,
        handler: Callable,
        port: int | None = None,
        timeout: float = 120.0,
        password: int = 0,
    ) -> Any:
        """Run custom SDK operations with exclusive device access.

        Pauses the device worker (preventing background queue processing),
        creates a fresh SDK connection, runs the handler, and disconnects.

        This is the replacement for the old pattern:
            sdk = ZKSDKService(ip, port)
            await get_device_lock(ip).acquire()
            try:
                sdk._connect_with_retry()
                result = handler(sdk)
            finally:
                sdk.disconnect()
                get_device_lock(ip).release()

        Args:
            device_ip: Device IP address
            handler: Synchronous callback that receives a connected ZKSDKService
            port: SDK port (default 4370)
            timeout: Connection timeout
            password: Device password

        Returns:
            Handler's return value
        """
        worker = await self.start_worker(
            device_ip,
            port=port,
            timeout=int(timeout),
            password=password,
        )

        # Pause the worker and close its SDK to prevent TCP conflicts
        await worker.pause()
        await worker._close_sdk()

        sdk = ZKSDKService(
            ip=device_ip,
            port=port or self._defaults["port"],
            timeout=int(timeout) or self._defaults["timeout"],
            password=password or self._defaults["password"],
        )
        loop = asyncio.get_running_loop()
        try:
            await loop.run_in_executor(None, sdk._connect_with_retry)
            result = await loop.run_in_executor(None, handler, sdk)
            return result
        finally:
            try:
                await loop.run_in_executor(None, sdk.disconnect)
            except Exception:
                pass
            finally:
                await worker.resume()

    async def execute_now(
        self,
        device_ip: str,
        job_type: str,
        payload: dict | None = None,
        timeout: float = 30.0,
    ) -> Any:
        """Execute a job immediately (bypasses queue) via run_sdk_operations.

        Wraps run_sdk_operations with a named handler from DeviceWorker.

        WARNING: Only use for urgent operations. For normal jobs, use enqueue().
        """
        def _handler(sdk: ZKSDKService) -> Any:
            handler = DeviceWorker._get_handler(DeviceWorker, job_type)
            if handler is None:
                raise ValueError(f"Unknown job type: {job_type}")
            return handler(sdk, DeviceJob(
                priority=JobPriority.ENROLLMENT,
                job_type=job_type,
                device_ip=device_ip,
                payload=payload or {},
            ))

        return await self.run_sdk_operations(
            device_ip=device_ip,
            handler=_handler,
            timeout=timeout,
        )


# Module-level convenience functions

async def enqueue_job(
    device_ip: str,
    priority: int,
    job_type: str,
    payload: dict | None = None,
) -> DeviceJob:
    """Convenience: enqueue a job via the singleton manager."""
    manager = await DeviceQueueManager.get_instance()
    return await manager.enqueue(device_ip, priority, job_type, payload)


async def execute_job_now(
    device_ip: str,
    job_type: str,
    payload: dict | None = None,
    timeout: float = 30.0,
) -> Any:
    """Convenience: execute a job immediately, bypassing the queue."""
    manager = await DeviceQueueManager.get_instance()
    return await manager.execute_now(device_ip, job_type, payload, timeout)


async def run_sdk_operations(
    device_ip: str,
    handler: Callable,
    port: int | None = None,
    timeout: float = 120.0,
    password: int = 0,
) -> Any:
    """Convenience: run custom SDK ops with exclusive device access."""
    manager = await DeviceQueueManager.get_instance()
    return await manager.run_sdk_operations(
        device_ip=device_ip,
        handler=handler,
        port=port,
        timeout=timeout,
        password=password,
    )


async def start_device_worker(
    device_ip: str,
    port: int = 4370,
    timeout: int = 10,
) -> DeviceWorker:
    """Convenience: start a device worker."""
    manager = await DeviceQueueManager.get_instance()
    return await manager.start_worker(device_ip, port, timeout)


async def stop_device_worker(device_ip: str) -> None:
    """Convenience: stop a device worker."""
    manager = await DeviceQueueManager.get_instance()
    await manager.stop_worker(device_ip)


async def get_device_states() -> dict[str, dict[str, Any]]:
    """Convenience: get states of all device workers."""
    manager = await DeviceQueueManager.get_instance()
    return manager.get_states()


async def shutdown_all_workers() -> None:
    """Graceful shutdown of all device workers."""
    manager = await DeviceQueueManager.get_instance()
    await manager.stop_all()
    logger.info("DeviceQueueManager: All workers stopped")
