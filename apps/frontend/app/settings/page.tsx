"use client";

import { Badge } from "@/components/ui/badge";
import { useEffect, useState } from "react";

const alertsStorageKey = "suhan-dashboard-alerts-enabled";

const settingSections = [
  {
    title: "Projects",
    href: "/settings/projects",
    label: "Active",
    description: "프로젝트, 상태 API, 로고를 함께 관리합니다.",
  },
  {
    title: "Integrations",
    href: null,
    label: "Soon",
    description: "GitHub, Slack 같은 외부 연결 설정을 둘 자리입니다.",
  },
  {
    title: "Workspace",
    href: null,
    label: "Soon",
    description: "워크스페이스 기본값과 표시 옵션을 관리할 자리입니다.",
  },
];

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
      {settingSections.map((section) => {
        const content = (
          <>
            <div className="card-header">
              <div>
                <p className="eyebrow">Settings</p>
                <h2>{section.title}</h2>
              </div>
              <Badge className="metric" variant="outline">{section.label}</Badge>
            </div>
            <p className="card-copy">{section.description}</p>
          </>
        );

        return section.href ? (
          <a className="dashboard-card settings-home-card" href={section.href} key={section.title}>
            {content}
          </a>
        ) : (
          <section className="dashboard-card settings-home-card disabled" key={section.title}>
            {content}
          </section>
        );
      })}
    </div>
  );
}
