"""Rodasoft Capability Tester UI"""
import sys, os, json, time
from datetime import datetime
from PySide6.QtWidgets import *
from PySide6.QtCore import *
from PySide6.QtGui import *
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from core.logger import get_logger, ensure_log_dir
from core.device_connector import DeviceConfig, DeviceConnector
from modules.enrollment_tester import EnrollmentWorker, EnrollmentResult
from modules.event_monitor import EventMonitorWorker
from modules.user_retrieval import UserRetrievalWorker
from modules.sync_tester import SyncWorker, SyncResult
from modules.report_generator import CapabilityReport
log = get_logger("ui")
CFG = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),"devices.json")

class DevicePanel(QWidget):
    def __init__(self):
        super().__init__(); self.conns={}; self.setup_ui(); self.load()
    def setup_ui(self):
        l=QVBoxLayout(self); l.setContentsMargins(10,10,10,10)
        l.addWidget(QLabel("<b>Configured Devices</b>"))
        self.tbl=QTableWidget(0,6)
        self.tbl.setHorizontalHeaderLabels(["Name","IP","Port","FW","Status","Last Ping"])
        self.tbl.horizontalHeader().setStretchLastSection(True)
        self.tbl.setSelectionBehavior(QAbstractItemView.SelectRows)
        l.addWidget(self.tbl)
        af=QGroupBox("Add Device"); ag=QHBoxLayout()
        self.ne=QLineEdit(); self.ne.setPlaceholderText("Name")
        self.ie=QLineEdit(); self.ie.setPlaceholderText("IP")
        self.pe=QSpinBox(); self.pe.setRange(1,65535); self.pe.setValue(4370)
        self.pwe=QSpinBox(); self.pwe.setRange(0,999999); self.pwe.setValue(0)
        self.ab=QPushButton("Add"); self.ab.clicked.connect(self.add)
        ag.addWidget(QLabel("Name:")); ag.addWidget(self.ne)
        ag.addWidget(QLabel("IP:")); ag.addWidget(self.ie)
        ag.addWidget(QLabel("Port:")); ag.addWidget(self.pe)
        ag.addWidget(QLabel("Pwd:")); ag.addWidget(self.pwe)
        ag.addWidget(self.ab); af.setLayout(ag); l.addWidget(af)
        ctrl=QHBoxLayout()
        self.cab=QPushButton("Connect All"); self.cab.clicked.connect(lambda: self.op_all(True))
        self.dab=QPushButton("Disconnect All"); self.dab.clicked.connect(lambda: self.op_all(False))
        ctrl.addWidget(self.cab); ctrl.addWidget(self.dab); ctrl.addStretch(); l.addLayout(ctrl); l.addStretch()
    def load(self):
        if os.path.exists(CFG):
            try:
                with open(CFG) as f: data=json.load(f)
                for d in data:
                    try: self.conns[d["name"]]=DeviceConnector(DeviceConfig.from_dict(d))
                    except Exception: pass
                self.refresh()
            except Exception: pass
    def save(self):
        try:
            with open(CFG,'w') as f: json.dump([c.config.dict() for c in self.conns.values()],f,indent=2)
        except Exception: pass

    def add(self):
        n=self.ne.text().strip(); i=self.ie.text().strip()
        if not n or not i: QMessageBox.warning(self,"Error","Name and IP required"); return
        if n in self.conns: QMessageBox.warning(self,"Error","Exists"); return
        self.conns[n]=DeviceConnector(DeviceConfig(n,i,self.pe.value(),self.pwe.value()))
        self.save(); self.refresh(); self.ne.clear(); self.ie.clear()
    def refresh(self):
        self.tbl.setRowCount(0)
        for n,c in self.conns.items():
            r=self.tbl.rowCount(); self.tbl.insertRow(r)
            self.tbl.setItem(r,0,QTableWidgetItem(n))
            self.tbl.setItem(r,1,QTableWidgetItem(c.config.ip))
            self.tbl.setItem(r,2,QTableWidgetItem(str(c.config.port)))
            self.tbl.setItem(r,3,QTableWidgetItem(str(c.get_firmware_version() or "?")))
            s=QTableWidgetItem("Connected" if c.is_connected else "Disconnected")
            s.setForeground(QColor("green" if c.is_connected else "red"))
            self.tbl.setItem(r,4,s)
            self.tbl.setItem(r,5,QTableWidgetItem(str(c._lp or "Never")))
    def op_all(self,con):
        for n,c in self.conns.items():
            try:
                if con and not c.is_connected: c.connect()
                elif not con and c.is_connected: c.disconnect()
            except Exception: pass
        self.refresh()
    def get(self,n): return self.conns.get(n)
    def names(self): return list(self.conns.keys())

class EnrollmentPanel(QWidget):
    def __init__(self,dm): super().__init__(); self.dm=dm; self.w=None; self.setup_ui()
    def setup_ui(self):
        l=QVBoxLayout(self); l.addWidget(QLabel("<b>Enrollment Tester</b>"))
        g=QHBoxLayout(); g.addWidget(QLabel("Device:"))
        self.dc=QComboBox(); g.addWidget(self.dc)
        g.addWidget(QLabel("UID:")); self.us=QSpinBox(); self.us.setRange(1,99999); self.us.setValue(1); g.addWidget(self.us)
        g.addStretch(); l.addLayout(g)
        bg=QHBoxLayout()
        self.fb=QPushButton("Start Finger Enrollment"); self.fb.setStyleSheet("background:#4CAF50;color:white;padding:8px;")
        self.fb.clicked.connect(self.start); bg.addWidget(self.fb)
        self.cb=QPushButton("Cancel"); self.cb.setEnabled(False); self.cb.clicked.connect(self.cancel)
        bg.addWidget(self.cb); bg.addStretch(); l.addLayout(bg)
        l.addWidget(QLabel("Log:")); self.tx=QTextEdit(); self.tx.setReadOnly(True); l.addWidget(self.tx)
        self.st=QLabel("Ready"); l.addWidget(self.st)

    def refresh(self): self.dc.clear(); [self.dc.addItem(n) for n in self.dm.names()]
    def _log(self,lv,m): self.tx.append(f"[{datetime.now().strftime('%H:%M:%S')}] [{lv}] {m}")
    def start(self):
        n=self.dc.currentText()
        if not n or not self.dm.get(n) or not self.dm.get(n).is_connected:
            QMessageBox.warning(self,"Error","Select connected device"); return
        self.tx.clear(); self._log("INFO","Starting enrollment...")
        self.fb.setEnabled(False); self.cb.setEnabled(True)
        self.w=EnrollmentWorker(self.dm.get(n),self.us.value())
        self.w.enrollment_complete.connect(lambda r: self._done(r))
        self.w.sdk_call.connect(lambda req,resp,ok,d: self._log("SDK",f"{req} -> {resp} ({'OK' if ok else 'FAIL'}, {d:.0f}ms)"))
        self.w.status_update.connect(lambda s: self.st.setText(s)); self.w.start()
    def _done(self,r):
        self.fb.setEnabled(True); self.cb.setEnabled(False)
        if r.success:
            self.st.setText("SUCCESS")
            self._log("INFO",f"Done in {r.duration_ms:.0f}ms")
        else:
            self.st.setText(f"FAILED: {r.error}")
            self._log("ERROR",str(r.error))
        for ts,ev,det in r.timeline: self._log("EVENT",f"{ev}: {det}")
    def cancel(self):
        if self.w: self.w.cancel()
        self.fb.setEnabled(True); self.cb.setEnabled(False); self.st.setText("Cancelled")

class EventPanel(QWidget):
    def __init__(self,dm): super().__init__(); self.dm=dm; self.ws={}; self.setup_ui()
    def setup_ui(self):
        l=QVBoxLayout(self); l.addWidget(QLabel("<b>Event Monitor</b>"))
        g=QHBoxLayout()
        self.sb=QPushButton("Start All"); self.sb.clicked.connect(self.start)
        self.spb=QPushButton("Stop All"); self.spb.setEnabled(False); self.spb.clicked.connect(self.stop)
        self.clb=QPushButton("Clear"); self.clb.clicked.connect(lambda: self.el.clear())
        g.addWidget(self.sb); g.addWidget(self.spb); g.addWidget(self.clb); g.addStretch(); l.addLayout(g)
        self.el=QTextEdit(); self.el.setReadOnly(True); l.addWidget(QLabel("Events:")); l.addWidget(self.el)
        self.st=QLabel("Stopped"); l.addWidget(self.st)
    def start(self):
        cnt=0
        for n in self.dm.names():
            c=self.dm.get(n)
            if c and c.is_connected:
                w=EventMonitorWorker(c)
                w.event_received.connect(lambda t,d,x: self.el.append(f"[{datetime.now().strftime('%H:%M:%S')}] [{d}] {t}: {x}"))
                w.error_occurred.connect(lambda e: self.el.append(f"<span style='color:red'>ERR: {e}</span>"))
                self.ws[n]=w; w.start(); cnt+=1
        self.sb.setEnabled(False); self.spb.setEnabled(True); self.st.setText(f"Monitoring {cnt}")
    def stop(self):
        for w in self.ws.values(): w.stop()
        self.ws.clear(); self.sb.setEnabled(True); self.spb.setEnabled(False); self.st.setText("Stopped")

class UserPanel(QWidget):
    def __init__(self,dm): super().__init__(); self.dm=dm; self.w=None; self.setup_ui()
    def setup_ui(self):
        l=QVBoxLayout(self); l.addWidget(QLabel("<b>User Retrieval</b>"))
        g=QHBoxLayout(); g.addWidget(QLabel("Device:")); self.dc=QComboBox(); g.addWidget(self.dc)
        self.rb=QPushButton("Retrieve"); self.rb.setStyleSheet("background:#2196F3;color:white;padding:8px;")
        self.rb.clicked.connect(self.retrieve); g.addWidget(self.rb); g.addStretch(); l.addLayout(g)
        self.tx=QTextEdit(); self.tx.setReadOnly(True); l.addWidget(QLabel("Results:")); l.addWidget(self.tx)
        self.st=QLabel("Ready"); l.addWidget(self.st)
    def refresh(self): self.dc.clear(); [self.dc.addItem(n) for n in self.dm.names()]
    def retrieve(self):
        n=self.dc.currentText()
        if not n or not self.dm.get(n) or not self.dm.get(n).is_connected:
            QMessageBox.warning(self,"Error","Select connected device"); return
        self.tx.clear(); self.st.setText("Retrieving..."); self.rb.setEnabled(False)
        self.w=UserRetrievalWorker(self.dm.get(n))
        self.w.retrieval_complete.connect(self.done)
        self.w.log_update.connect(lambda lv,m: self.tx.append(f"[{lv.upper()}] {m}")); self.w.start()
    def done(self,r):
        self.rb.setEnabled(True); self.st.setText("Done")
        self.tx.append(f"[INFO] Users: {r.get('user_count',0)}")
        self.tx.append(f"[INFO] Templates: {'SUPPORTED' if r.get('template_export_supported') else 'NOT SUPPORTED'}" + (f" ({r.get('template_count','?')})" if r.get('template_export_supported') else ""))
        self.tx.append(f"[INFO] Attendance: {r.get('attendance_count',0)} records")
        for e in r.get('errors',[]): self.tx.append(f"[ERROR] {e}")

class SyncPanel(QWidget):
    def __init__(self,dm): super().__init__(); self.dm=dm; self.w=None; self.setup_ui()
    def setup_ui(self):
        l=QVBoxLayout(self); l.addWidget(QLabel("<b>Synchronization Tester</b>"))
        g=QHBoxLayout(); g.addWidget(QLabel("Source:")); self.sc=QComboBox(); g.addWidget(self.sc)
        g.addWidget(QLabel("Dest:")); self.dc=QComboBox(); g.addWidget(self.dc)
        g.addWidget(QLabel("UID:")); self.us=QSpinBox(); self.us.setRange(1,99999); g.addWidget(self.us)
        self.sb=QPushButton("Attempt Sync"); self.sb.setStyleSheet("background:#9C27B0;color:white;padding:8px;")
        self.sb.clicked.connect(self.sync); g.addWidget(self.sb); g.addStretch(); l.addLayout(g)
        self.tx=QTextEdit(); self.tx.setReadOnly(True); l.addWidget(QLabel("Log:")); l.addWidget(self.tx)
        self.st=QLabel("Ready"); l.addWidget(self.st)
    def refresh(self):
        ds=self.dm.names(); self.sc.clear(); self.dc.clear()
        for n in ds: self.sc.addItem(n); self.dc.addItem(n)
    def sync(self):
        s=self.sc.currentText(); d=self.dc.currentText()
        if not s or not d or s==d: QMessageBox.warning(self,"Error","Select two different devices"); return
        sc=self.dm.get(s); dc=self.dm.get(d)
        if not sc or not sc.is_connected or not dc or not dc.is_connected: QMessageBox.warning(self,"Error","Both must be connected"); return
        self.tx.clear(); self.st.setText("Syncing..."); self.sb.setEnabled(False)
        self.w=SyncWorker(sc,dc,self.us.value())
        self.w.sync_complete.connect(self.done)
        self.w.step_complete.connect(lambda s,r,ok,d: self.tx.append(f"[STEP] {s}: {r} ({'OK' if ok else 'FAIL'}, {d:.0f}ms)"))
        self.w.start()
    def done(self,r):
        self.sb.setEnabled(True); self.st.setText("Done")
        self.tx.append(f"[RESULT] {r.conclusion}")
        for s in r.steps:
            ok=s.get('success'); self.tx.append(f"  {s.get('step','?')}: {'OK' if ok else 'FAIL' if ok is False else 'N/A'} ({s.get('duration_ms',0):.0f}ms)")

class ReportPanel(QWidget):
    def __init__(self,dm): super().__init__(); self.dm=dm; self.setup_ui()
    def setup_ui(self):
        l=QVBoxLayout(self); l.addWidget(QLabel("<b>Capability Report Generator</b>"))
        g=QHBoxLayout(); g.addWidget(QLabel("Device:")); self.dc=QComboBox(); g.addWidget(self.dc)
        self.gb=QPushButton("Generate Report"); self.gb.setStyleSheet("background:#FF5722;color:white;padding:8px;")
        self.gb.clicked.connect(self.gen); g.addWidget(self.gb); g.addStretch(); l.addLayout(g)
        self.pv=QTextEdit(); self.pv.setReadOnly(True); l.addWidget(QLabel("Preview:")); l.addWidget(self.pv)
        self.st=QLabel("Ready"); l.addWidget(self.st)
    def refresh(self): self.dc.clear(); [self.dc.addItem(n) for n in self.dm.names()]
    def gen(self):
        n=self.dc.currentText()
        if not n: QMessageBox.warning(self,"Error","Select device"); return
        c=self.dm.get(n); r=CapabilityReport(n)
        r.add_test("remote_connect","PASS" if c and c.is_connected else "FAIL")
        if c and c.is_connected:
            try: u=c.get_users(); r.add_test("get_users","PASS",f"{len(u)} users")
            except Exception as e: r.add_test("get_users","FAIL",str(e))
            try: t=c.get_templates(); r.add_test("get_templates","PASS",f"{len(t)} tpl")
            except Exception as e: r.add_test("get_templates","NOT_SUPPORTED" if "not" in str(e).lower() else "FAIL",str(e))
            try: a=c.get_attendance(); r.add_test("get_attendance","PASS",f"{len(a)} records")
            except Exception as e: r.add_test("get_attendance","FAIL",str(e))
        r.add_test("finger_enrollment","UNKNOWN","Run enrollment test")
        r.add_test("synchronization","UNKNOWN","Run sync test")
        r.add_note("Manual tests required")
        p=r.save(); self.pv.setText(r.to_md()); self.st.setText(f"Saved: {p}")

class LogPanel(QWidget):
    def __init__(self): super().__init__(); self.setup_ui()
    def setup_ui(self):
        l=QVBoxLayout(self); l.addWidget(QLabel("<b>Log Files</b>"))
        g=QHBoxLayout(); self.rb=QPushButton("Refresh"); self.rb.clicked.connect(self.ref); g.addWidget(self.rb); g.addStretch(); l.addLayout(g)
        self.ll=QListWidget(); self.ll.itemClicked.connect(self.show); l.addWidget(self.ll)
        self.lc=QTextEdit(); self.lc.setReadOnly(True); l.addWidget(self.lc); self.ref()
    def ref(self):
        self.ll.clear()
        d=os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),"logs")
        if os.path.exists(d):
            for f in sorted(os.listdir(d),reverse=True)[:30]: self.ll.addItem(f)
    def show(self,item):
        d=os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),"logs"); p=os.path.join(d,item.text())
        try:
            with open(p,encoding='utf-8') as f: c=f.read()
            self.lc.setText(c[-50000:])
        except Exception: self.lc.setText(f"Error reading {p}")

class MainWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("Rodasoft Device Capability Verification Tool")
        self.setMinimumSize(1300,750)
        self.dp=DevicePanel()
        self.ep=EnrollmentPanel(self.dp)
        self.evp=EventPanel(self.dp)
        self.up=UserPanel(self.dp)
        self.sp=SyncPanel(self.dp)
        self.rp=ReportPanel(self.dp)
        self.lp=LogPanel()
        self.stl=QLabel("Ready")
        self.statusBar().addWidget(self.stl)
        self.statusBar().addPermanentWidget(QLabel("pyzk SDK"))
        self.setup_ui()
    def setup_ui(self):
        cw=QWidget(); self.setCentralWidget(cw)
        ml=QHBoxLayout(cw); ml.setContentsMargins(0,0,0,0); ml.setSpacing(0)
        sb=QWidget(); sb.setFixedWidth(170); sb.setStyleSheet("background:#263238;")
        sl=QVBoxLayout(sb); sl.setContentsMargins(0,0,0,0); sl.setSpacing(0)
        t=QLabel("Rodasoft\nTester")
        t.setStyleSheet("color:white;font-size:15px;font-weight:bold;padding:15px 10px;background:#37474F;")
        t.setAlignment(Qt.AlignCenter); sl.addWidget(t)
        self.sw=QStackedWidget()
        dash=QWidget(); dl=QVBoxLayout(dash)
        dl.addWidget(QLabel("<h2>Rodasoft Device Capability Verification Tool</h2>"))
        dl.addWidget(QLabel("Select a module from the sidebar to begin testing."))
        dl.addWidget(QLabel("<b>No assumptions. No mock data. Only verified hardware results.</b>"))
        dl.addStretch(); self.sw.addWidget(dash)
        panels=[("Devices",self.dp),("Enrollment",self.ep),("Events",self.evp),("Users",self.up),("Sync",self.sp),("Reports",self.rp),("Logs",self.lp)]
        for lbl,p in panels: self.sw.addWidget(p)
        self.nav={}
        self.switch(0,None)
        for i,(lbl,_) in enumerate(panels,1):
            btn=QPushButton(f"  {lbl}")
            btn.setStyleSheet("QPushButton{color:#B0BEC5;text-align:left;padding:10px 15px;border:none;font-size:13px;background:transparent}QPushButton:hover{background:#37474F;color:white}QPushButton:checked{background:#1565C0;color:white;font-weight:bold}")
            btn.setCheckable(True); btn.clicked.connect(lambda c,idx=i,b=btn: self.switch(idx,b))
            sl.addWidget(btn)
            self.nav[i]=btn
        sl.addWidget(QLabel("v1.0.0",styleSheet="color:#546E7A;padding:8px;",alignment=Qt.AlignCenter))
        ml.addWidget(sb); ml.addWidget(self.sw,1)
    def switch(self,idx,btn):
        for b in self.nav.values():
            if b is not btn and hasattr(b,'setChecked'):
                b.setChecked(False)
        if btn: btn.setChecked(True)
        self.sw.setCurrentIndex(idx)
        self.stl.setText(f"Module: {btn.text().strip()}" if btn else "Ready")
        for p in [self.ep,self.evp,self.up,self.sp,self.rp]:
            if hasattr(p,'refresh'): p.refresh()

def main():
    log.info("Starting Rodasoft Tester...")
    app=QApplication(sys.argv); app.setStyle('Fusion'); ensure_log_dir()
    w=MainWindow(); w.show()
    sys.exit(app.exec())

if __name__=="__main__": main()

