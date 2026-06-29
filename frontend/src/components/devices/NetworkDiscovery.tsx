import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Search, Monitor, CheckCircle, Plus, Loader2, Wifi, Globe } from 'lucide-react'
import { deviceDiscoveryAPI } from '@/api/client'
import { toast } from 'sonner'

interface DiscoveredDevice {
  ip: string
  port: number
  serial_number: string
  model: string
  firmware_version: string
  platform: string
  mac_address: string
  is_registered: boolean
  device_id: string | null
  device_name: string | null
}

interface ScanResult {
  cidr: string
  scanned: number
  discovered: number
  devices: DiscoveredDevice[]
  duration_ms: number
}

export function NetworkDiscovery() {
  const queryClient = useQueryClient()
  const [cidr, setCidr] = useState('172.16.40.0/24')
  const [scanResult, setScanResult] = useState<ScanResult | null>(null)
  const [registeringIp, setRegisteringIp] = useState<string | null>(null)
  const [deviceName, setDeviceName] = useState('')

  const scanMutation = useMutation({
    mutationFn: () => deviceDiscoveryAPI.fullScan(cidr),
    onSuccess: (data) => {
      setScanResult(data.data)
      toast.success(`Found ${data.data.discovered} devices in ${data.data.duration_ms}ms`)
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.detail || 'Scan failed')
    },
  })

  const quickScanMutation = useMutation({
    mutationFn: () => deviceDiscoveryAPI.quickScan(cidr),
    onSuccess: (data) => {
      setScanResult({
        ...data.data,
        devices: data.data.devices.map((d: any) => ({
          ...d,
          serial_number: '',
          model: 'Unknown',
          firmware_version: '',
          platform: '',
          mac_address: '',
          is_registered: false,
          device_id: null,
          device_name: null,
        })),
      })
      toast.success(`Quick scan: ${data.data.reachable} hosts reachable in ${data.data.duration_ms}ms`)
    },
    onError: (err: any) => toast.error('Quick scan failed'),
  })

  const registerMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => deviceDiscoveryAPI.register(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['devices'] })
      toast.success('Device registered successfully')
      setRegisteringIp(null)
      setDeviceName('')
      // Update local state
      if (scanResult && registeringIp) {
        setScanResult({
          ...scanResult,
          devices: scanResult.devices.map(d =>
            d.ip === registeringIp ? { ...d, is_registered: true } : d
          ),
        })
      }
    },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Registration failed'),
  })

  const handleRegister = (device: DiscoveredDevice) => {
    setRegisteringIp(device.ip)
    setDeviceName(`${device.model || 'Device'} - ${device.ip}`)
  }

  const confirmRegister = () => {
    if (!registeringIp || !deviceName.trim()) return
    const device = scanResult?.devices.find(d => d.ip === registeringIp)
    if (!device) return
    registerMutation.mutate({
      ip_address: device.ip,
      serial_number: device.serial_number,
      name: deviceName.trim(),
      model: device.model,
      firmware_version: device.firmware_version,
      platform: device.platform,
      mac_address: device.mac_address,
      port: device.port,
    })
  }

  const registered = scanResult?.devices.filter(d => d.is_registered) ?? []
  const unregistered = scanResult?.devices.filter(d => !d.is_registered) ?? []

  return (
    <div className="space-y-5">
      {/* Scan Controls */}
      <div className="pz-card p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20">
            <Globe size={18} className="text-blue-400" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-[var(--pz-text)]">Network Discovery</h3>
            <p className="text-xs text-[var(--pz-text-muted)]">Scan network range to find ZKTeco biometric devices</p>
          </div>
        </div>

        <div className="flex items-end gap-3">
          <div className="flex-1 max-w-xs">
            <label className="text-[10px] font-bold text-[var(--pz-text-muted)] uppercase tracking-wider mb-1.5 block">Network Range (CIDR)</label>
            <input
              value={cidr}
              onChange={(e) => setCidr(e.target.value)}
              placeholder="172.16.40.0/24"
              className="w-full px-4 py-2.5 rounded-xl bg-[var(--pz-surface-2)] border border-[var(--pz-border)] text-sm font-mono text-[var(--pz-text)] placeholder:text-[var(--pz-text-muted)] focus:outline-none focus:border-blue-500/50 transition-colors"
            />
          </div>
          <button
            onClick={() => scanMutation.mutate()}
            disabled={scanMutation.isPending}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white text-sm font-semibold transition-all shadow-lg shadow-blue-600/20 disabled:opacity-50"
          >
            {scanMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
            {scanMutation.isPending ? 'Scanning...' : 'Full Scan'}
          </button>
          <button
            onClick={() => quickScanMutation.mutate()}
            disabled={quickScanMutation.isPending}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[var(--pz-surface-2)] hover:bg-[var(--pz-surface-3)] border border-[var(--pz-border)] text-sm font-semibold text-[var(--pz-text-secondary)] transition-all disabled:opacity-50"
          >
            {quickScanMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Wifi size={16} />}
            Quick Scan
          </button>
        </div>
      </div>

      {/* Scan Results */}
      {scanResult && (
        <>
          {/* Summary */}
          <div className="grid grid-cols-3 gap-4">
            <div className="pz-card p-4">
              <p className="text-[10px] font-bold text-[var(--pz-text-muted)] uppercase tracking-wider">Scanned</p>
              <p className="text-2xl font-bold text-[var(--pz-text)]">{scanResult.scanned}</p>
              <p className="text-[10px] text-[var(--pz-text-muted)]">hosts in {scanResult.duration_ms}ms</p>
            </div>
            <div className="pz-card p-4">
              <p className="text-[10px] font-bold text-[var(--pz-text-muted)] uppercase tracking-wider">Discovered</p>
              <p className="text-2xl font-bold text-blue-400">{scanResult.discovered}</p>
              <p className="text-[10px] text-[var(--pz-text-muted)]">devices found</p>
            </div>
            <div className="pz-card p-4">
              <p className="text-[10px] font-bold text-[var(--pz-text-muted)] uppercase tracking-wider">Already Registered</p>
              <p className="text-2xl font-bold text-emerald-400">{registered.length}</p>
              <p className="text-[10px] text-[var(--pz-text-muted)]">in system</p>
            </div>
          </div>

          {/* New Devices */}
          {unregistered.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-[var(--pz-text)] flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-amber-400" />
                New Devices ({unregistered.length})
              </h3>
              {unregistered.map((device) => (
                <div key={device.ip} className="pz-card p-4">
                  {registeringIp === device.ip ? (
                    <div className="flex items-center gap-3">
                      <Monitor size={18} className="text-amber-400 flex-shrink-0" />
                      <div className="flex-1">
                        <input
                          value={deviceName}
                          onChange={(e) => setDeviceName(e.target.value)}
                          placeholder="Device name"
                          className="w-full px-3 py-2 rounded-lg bg-[var(--pz-surface-2)] border border-[var(--pz-border)] text-sm text-[var(--pz-text)] focus:outline-none focus:border-blue-500/50"
                          autoFocus
                          onKeyDown={(e) => e.key === 'Enter' && confirmRegister()}
                        />
                      </div>
                      <button
                        onClick={confirmRegister}
                        disabled={!deviceName.trim() || registerMutation.isPending}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-colors disabled:opacity-50"
                      >
                        {registerMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle size={12} />}
                        Register
                      </button>
                      <button
                        onClick={() => { setRegisteringIp(null); setDeviceName('') }}
                        className="px-3 py-2 rounded-lg text-xs font-semibold text-[var(--pz-text-muted)] hover:text-[var(--pz-text)]"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
                          <Monitor size={16} className="text-amber-400" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-[var(--pz-text)]">{device.model || 'Unknown Device'}</p>
                          <p className="text-[10px] text-[var(--pz-text-muted)] font-mono">{device.ip}:{device.port}</p>
                          {device.serial_number && (
                            <p className="text-[10px] text-[var(--pz-text-muted)] font-mono">SN: {device.serial_number}</p>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => handleRegister(device)}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition-colors"
                      >
                        <Plus size={12} />
                        Pair Device
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Already Registered */}
          {registered.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-[var(--pz-text)] flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-400" />
                Already Registered ({registered.length})
              </h3>
              {registered.map((device) => (
                <div key={device.ip} className="pz-card p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                      <CheckCircle size={16} className="text-emerald-400" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-[var(--pz-text)]">{device.device_name || device.model}</p>
                      <p className="text-[10px] text-[var(--pz-text-muted)] font-mono">{device.ip} · {device.serial_number}</p>
                    </div>
                  </div>
                  <span className="text-xs font-semibold text-emerald-400 bg-emerald-500/10 px-3 py-1 rounded-lg border border-emerald-500/20">
                    Registered
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* No devices found */}
          {scanResult.discovered === 0 && (
            <div className="pz-card p-12 text-center">
              <Search size={32} className="mx-auto mb-3 text-[var(--pz-text-muted)] opacity-30" />
              <p className="text-sm font-medium text-[var(--pz-text-muted)]">No devices found in this range</p>
              <p className="text-xs text-[var(--pz-text-muted)] mt-1">Verify the CIDR range and ensure devices are powered on and connected</p>
            </div>
          )}
        </>
      )}

      {/* Initial state */}
      {!scanResult && !scanMutation.isPending && (
        <div className="pz-card p-16 text-center">
          <Search size={48} className="mx-auto mb-4 text-[var(--pz-text-muted)] opacity-20" />
          <p className="text-sm font-medium text-[var(--pz-text-muted)]">Enter a network range and start scanning</p>
          <p className="text-xs text-[var(--pz-text-muted)] mt-1">Default range: 172.16.40.0/24 (254 hosts)</p>
        </div>
      )}

      {/* Scanning animation */}
      {scanMutation.isPending && (
        <div className="pz-card p-16 text-center">
          <Loader2 size={48} className="mx-auto mb-4 text-blue-400 animate-spin" />
          <p className="text-sm font-bold text-[var(--pz-text)]">Scanning network...</p>
          <p className="text-xs text-[var(--pz-text-muted)] mt-1">Probing {cidr} for ZKTeco devices on port 4370</p>
        </div>
      )}
    </div>
  )
}
