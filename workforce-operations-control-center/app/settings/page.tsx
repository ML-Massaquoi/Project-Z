"use client"

import { AppLayout } from "@/components/layout/app-layout"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Save, Building2, Clock, Cpu, Users, Shield, Bell, Database } from "lucide-react"

export default function SettingsPage() {
  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Settings</h1>
            <p className="text-sm text-muted-foreground">
              Configure system preferences and operational rules
            </p>
          </div>
          <Button>
            <Save className="mr-2 h-4 w-4" />
            Save Changes
          </Button>
        </div>

        {/* Settings Tabs */}
        <Tabs defaultValue="general" className="w-full">
          <TabsList className="flex-wrap h-auto gap-1 bg-muted/50 p-1">
            <TabsTrigger value="general" className="gap-2">
              <Building2 className="h-4 w-4" />
              General
            </TabsTrigger>
            <TabsTrigger value="attendance" className="gap-2">
              <Clock className="h-4 w-4" />
              Attendance Rules
            </TabsTrigger>
            <TabsTrigger value="devices" className="gap-2">
              <Cpu className="h-4 w-4" />
              Devices
            </TabsTrigger>
            <TabsTrigger value="users" className="gap-2">
              <Users className="h-4 w-4" />
              Users
            </TabsTrigger>
            <TabsTrigger value="roles" className="gap-2">
              <Shield className="h-4 w-4" />
              Roles
            </TabsTrigger>
            <TabsTrigger value="notifications" className="gap-2">
              <Bell className="h-4 w-4" />
              Notifications
            </TabsTrigger>
            <TabsTrigger value="backup" className="gap-2">
              <Database className="h-4 w-4" />
              Backup
            </TabsTrigger>
          </TabsList>

          {/* General Settings */}
          <TabsContent value="general" className="mt-6">
            <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
              <h2 className="font-semibold text-card-foreground mb-4">General Settings</h2>
              <div className="space-y-6">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="text-sm text-muted-foreground mb-1.5 block">Organization Name</label>
                    <Input defaultValue="International Airport Authority" className="bg-background" />
                  </div>
                  <div>
                    <label className="text-sm text-muted-foreground mb-1.5 block">Timezone</label>
                    <Select defaultValue="gmt4">
                      <SelectTrigger className="bg-background">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="gmt4">GMT+4 (Dubai)</SelectItem>
                        <SelectItem value="gmt0">GMT+0 (London)</SelectItem>
                        <SelectItem value="gmt-5">GMT-5 (New York)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="text-sm text-muted-foreground mb-1.5 block">Date Format</label>
                    <Select defaultValue="dmy">
                      <SelectTrigger className="bg-background">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="dmy">DD/MM/YYYY</SelectItem>
                        <SelectItem value="mdy">MM/DD/YYYY</SelectItem>
                        <SelectItem value="ymd">YYYY-MM-DD</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-sm text-muted-foreground mb-1.5 block">Time Format</label>
                    <Select defaultValue="24h">
                      <SelectTrigger className="bg-background">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="24h">24-hour</SelectItem>
                        <SelectItem value="12h">12-hour</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>

          {/* Attendance Rules */}
          <TabsContent value="attendance" className="mt-6">
            <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
              <h2 className="font-semibold text-card-foreground mb-4">Attendance Rules</h2>
              <div className="space-y-6">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="text-sm text-muted-foreground mb-1.5 block">Default Grace Period (minutes)</label>
                    <Input type="number" defaultValue="15" className="bg-background" />
                  </div>
                  <div>
                    <label className="text-sm text-muted-foreground mb-1.5 block">Minimum Working Hours</label>
                    <Input type="number" defaultValue="8" className="bg-background" />
                  </div>
                </div>
                <div className="space-y-4">
                  <div className="flex items-center justify-between rounded-lg border border-border p-4">
                    <div>
                      <p className="font-medium text-sm text-card-foreground">Auto-mark Absent</p>
                      <p className="text-xs text-muted-foreground">Automatically mark employees as absent if no scan by cutoff</p>
                    </div>
                    <Switch defaultChecked />
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-border p-4">
                    <div>
                      <p className="font-medium text-sm text-card-foreground">Allow Multiple Check-ins</p>
                      <p className="text-xs text-muted-foreground">Allow employees to check in from multiple devices</p>
                    </div>
                    <Switch defaultChecked />
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-border p-4">
                    <div>
                      <p className="font-medium text-sm text-card-foreground">Weekend Working</p>
                      <p className="text-xs text-muted-foreground">Track attendance on weekends</p>
                    </div>
                    <Switch />
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>

          {/* Devices */}
          <TabsContent value="devices" className="mt-6">
            <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
              <h2 className="font-semibold text-card-foreground mb-4">Device Settings</h2>
              <div className="space-y-6">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="text-sm text-muted-foreground mb-1.5 block">Heartbeat Interval (seconds)</label>
                    <Input type="number" defaultValue="60" className="bg-background" />
                  </div>
                  <div>
                    <label className="text-sm text-muted-foreground mb-1.5 block">Offline Threshold (minutes)</label>
                    <Input type="number" defaultValue="5" className="bg-background" />
                  </div>
                </div>
                <div className="space-y-4">
                  <div className="flex items-center justify-between rounded-lg border border-border p-4">
                    <div>
                      <p className="font-medium text-sm text-card-foreground">Auto-sync Devices</p>
                      <p className="text-xs text-muted-foreground">Automatically sync devices at scheduled intervals</p>
                    </div>
                    <Switch defaultChecked />
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-border p-4">
                    <div>
                      <p className="font-medium text-sm text-card-foreground">Alert on Device Offline</p>
                      <p className="text-xs text-muted-foreground">Send notification when a device goes offline</p>
                    </div>
                    <Switch defaultChecked />
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>

          {/* Users */}
          <TabsContent value="users" className="mt-6">
            <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
              <h2 className="font-semibold text-card-foreground mb-4">User Management</h2>
              <p className="text-sm text-muted-foreground">Manage system users and their access permissions.</p>
              <div className="mt-4 rounded-lg border border-dashed border-border p-8 text-center">
                <Users className="mx-auto h-10 w-10 text-muted-foreground/50" />
                <p className="mt-2 text-sm text-muted-foreground">User management interface will be displayed here</p>
              </div>
            </div>
          </TabsContent>

          {/* Roles */}
          <TabsContent value="roles" className="mt-6">
            <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
              <h2 className="font-semibold text-card-foreground mb-4">Roles & Permissions</h2>
              <p className="text-sm text-muted-foreground">Configure user roles and their permissions.</p>
              <div className="mt-4 rounded-lg border border-dashed border-border p-8 text-center">
                <Shield className="mx-auto h-10 w-10 text-muted-foreground/50" />
                <p className="mt-2 text-sm text-muted-foreground">Role management interface will be displayed here</p>
              </div>
            </div>
          </TabsContent>

          {/* Notifications */}
          <TabsContent value="notifications" className="mt-6">
            <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
              <h2 className="font-semibold text-card-foreground mb-4">Notification Preferences</h2>
              <div className="space-y-4">
                <div className="flex items-center justify-between rounded-lg border border-border p-4">
                  <div>
                    <p className="font-medium text-sm text-card-foreground">Device Offline Alerts</p>
                    <p className="text-xs text-muted-foreground">Get notified when devices go offline</p>
                  </div>
                  <Switch defaultChecked />
                </div>
                <div className="flex items-center justify-between rounded-lg border border-border p-4">
                  <div>
                    <p className="font-medium text-sm text-card-foreground">Unknown Scan Alerts</p>
                    <p className="text-xs text-muted-foreground">Get notified for unregistered scans</p>
                  </div>
                  <Switch defaultChecked />
                </div>
                <div className="flex items-center justify-between rounded-lg border border-border p-4">
                  <div>
                    <p className="font-medium text-sm text-card-foreground">Attendance Exceptions</p>
                    <p className="text-xs text-muted-foreground">Get notified for attendance anomalies</p>
                  </div>
                  <Switch defaultChecked />
                </div>
                <div className="flex items-center justify-between rounded-lg border border-border p-4">
                  <div>
                    <p className="font-medium text-sm text-card-foreground">Daily Summary Email</p>
                    <p className="text-xs text-muted-foreground">Receive daily attendance summary via email</p>
                  </div>
                  <Switch />
                </div>
              </div>
            </div>
          </TabsContent>

          {/* Backup */}
          <TabsContent value="backup" className="mt-6">
            <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
              <h2 className="font-semibold text-card-foreground mb-4">Backup & Recovery</h2>
              <div className="space-y-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between rounded-lg border border-border p-4">
                    <div>
                      <p className="font-medium text-sm text-card-foreground">Automatic Backups</p>
                      <p className="text-xs text-muted-foreground">Automatically backup data daily</p>
                    </div>
                    <Switch defaultChecked />
                  </div>
                  <div>
                    <label className="text-sm text-muted-foreground mb-1.5 block">Backup Retention (days)</label>
                    <Input type="number" defaultValue="30" className="bg-background max-w-xs" />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline">
                    <Database className="mr-2 h-4 w-4" />
                    Create Backup Now
                  </Button>
                  <Button variant="outline">Restore from Backup</Button>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  )
}
