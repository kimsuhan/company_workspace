"use client";

import { Badge } from "@/components/ui/badge";
import { useEffect, useState } from "react";

const alertsStorageKey = "suhan-dashboard-alerts-enabled";

export default function SettingsHomePage() {
  const [areAlertsEnabled, setAreAlertsEnabled] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>("default");

  useEffect(() => {
    setAreAlertsEnabled(window.localStorage.getItem(alertsStorageKey) === "true");

    if ("Notification" in window) {
      setNotificationPermission(Notification.permission);
    }
  }, []);

  const updateAlertSetting = async (isEnabled: boolean) => {
    if (isEnabled && "Notification" in window) {
      const permission =
        Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
      setNotificationPermission(permission);
    }

    setAreAlertsEnabled(isEnabled);
    window.localStorage.setItem(alertsStorageKey, String(isEnabled));
  };

  return (
    <div className="settings-home-grid">
      <section className="dashboard-card settings-home-card">
        <div className="card-header">
          <div>
            <p className="eyebrow">Settings</p>
            <h2>Notifications</h2>
          </div>
          <Badge className="metric" variant="outline">{areAlertsEnabled ? "On" : "Off"}</Badge>
        </div>
        <label className="switch-field">
          <span>
            <strong>Dashboard Alerts</strong>
            <small>
              {notificationPermission === "denied"
                ? "브라우저 알림 권한이 차단되어 소리 알림만 사용할 수 있습니다."
                : "PR, Todo, Project Status 변경 알림을 켜거나 끕니다."}
            </small>
          </span>
          <input
            checked={areAlertsEnabled}
            onChange={(event) => void updateAlertSetting(event.target.checked)}
            type="checkbox"
          />
          <i aria-hidden="true" />
        </label>
      </section>
    </div>
  );
}
