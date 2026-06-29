"""Rodasoft Report Generator"""
import os, json
from datetime import datetime
from core.logger import get_logger
log=get_logger("report_generator")
RD=os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),"reports")

class CapabilityReport:
    def __init__(self,device_name="Unknown"):
        self.device_name=device_name; self.generated_at=datetime.now().isoformat()
        self.tests={}; self.summary={}; self.notes=[]
    def add_test(self,name,status,detail="",evidence=None):
        self.tests[name]={"status":status,"detail":detail,"evidence":evidence or [],"timestamp":datetime.now().isoformat()}
    def add_note(self,n): self.notes.append(n)
    def generate_summary(self):
        sc={}
        for t in self.tests.values(): s=t["status"]; sc[s]=sc.get(s,0)+1
        self.summary={"total":len(self.tests),"pass":sc.get("PASS",0),"fail":sc.get("FAIL",0),"unsupported":sc.get("NOT_SUPPORTED",0),"unknown":sc.get("UNKNOWN",0),"skip":sc.get("SKIP",0)}
        cc=[]
        for key,label in [("remote_connect","Remote connect"),("finger_enrollment","Remote finger enrollment"),("enrollment_events","Enrollment events"),("get_users","Retrieve users"),("get_templates","Export biometric templates"),("set_user","Create users"),("save_user_template","Import biometric templates"),("synchronization","User sync")]:
            s=self.tests.get(key,{}).get("status","UNKNOWN")
            if s=="PASS": cc.append(f"PASS: {label}")
            elif s=="FAIL": cc.append(f"FAIL: {label}")
            elif s=="NOT_SUPPORTED": cc.append(f"UNSUPPORTED: {label}")
            else: cc.append(f"UNKNOWN: {label}")
        self.summary["conclusions"]=cc; return self.summary
    def to_md(self):
        self.generate_summary()
        L=lambda *a: "| " + " | ".join(str(x) for x in a) + " |"
        lines=["# Rodasoft Device Capability Report",f"**Device:** {self.device_name}",f"**Generated:** {self.generated_at}","",
               "## Summary",L("Metric","Value"),L("---","---"),L("Total Tests",self.summary["total"]),
               L("Passed",self.summary["pass"]),L("Failed",self.summary["fail"]),L("Not Supported",self.summary["unsupported"]),
               L("Unknown",self.summary["unknown"]),L("Skipped",self.summary["skip"]),"","## Conclusions"]
        for c in self.summary["conclusions"]: lines.append(f"- {c}")
        lines.extend(["","## Detailed Results","| Test | Status | Detail |","|---|---|---|"])
        for n,t in self.tests.items(): lines.append(f"| {n} | {t['status']} | {t.get('detail','')} |")
        if self.notes: lines.extend(["","## Notes"]+[f"- {n}" for n in self.notes])
        return "\n".join(lines)
    def save(self,fmt="both"):
        os.makedirs(RD,exist_ok=True); ts=datetime.now().strftime("%Y%m%d_%H%M%S")
        base=os.path.join(RD,f"report_{self.device_name}_{ts}")
        self.generate_summary()
        data={"device_name":self.device_name,"generated_at":self.generated_at,"summary":self.summary,"tests":self.tests,"notes":self.notes}
        if fmt in ("json","both"):
            with open(base+".json","w",encoding="utf-8") as f: json.dump(data,f,indent=2,default=str)
        if fmt in ("md","both"):
            with open(base+".md","w",encoding="utf-8") as f: f.write(self.to_md())
        log.info(f"Report: {base}"); return base+".md"
