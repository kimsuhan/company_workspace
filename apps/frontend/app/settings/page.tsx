"use client";

import { Badge } from "@/components/ui/badge";
import { useEffect, useState } from "react";

import {
  dashboardGridMaxSize,
  dashboardGridSizes,
  dashboardGridStorageKey,
  defaultDashboardGridLayout,
  parseDashboardGridLayout,
  serializeDashboardGridLayout,
} from "../dashboard-grid-settings";
import type { DashboardGridLayout } from "../dashboard-grid-settings";

const alertsStorageKey = "suhan-dashboard-alerts-enabled";

export default function SettingsHomePage() {
  const [areAlertsEnabled, setAreAlertsEnabled] = useState(false);
  const [dashboardGridLayout, setDashboardGridLayout] = useState<DashboardGridLayout>(defaultDashboardGridLayout);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>("default");

  useEffect(() => {
    setAreAlertsEnabled(window.localStorage.getItem(alertsStorageKey) === "true");

    const savedGridLayout = window.localStorage.getItem(dashboardGridStorageKey);
    const parsedGridLayout = parseDashboardGridLayout(savedGridLayout);
    setDashboardGridLayout(parsedGridLayout);

    if (savedGridLayout !== serializeDashboardGridLayout(parsedGridLayout)) {
      window.localStorage.setItem(dashboardGridStorageKey, serializeDashboardGridLayout(parsedGridLayout));
    }

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

  const updateDashboardGridLayout = (layout: DashboardGridLayout) => {
    setDashboardGridLayout(layout);
    window.localStorage.setItem(dashboardGridStorageKey, serializeDashboardGridLayout(layout));
  };

  const updateDashboardGridPart = (key: keyof DashboardGridLayout, value: string) => {
    const size = Number(value);

    if (!Number.isInteger(size) || size < 1 || size > dashboardGridMaxSize) {
      return;
    }

    updateDashboardGridLayout({ ...dashboardGridLayout, [key]: size });
  };

  return (
    <div className="settings-home-grid">
      <section className="dashboard-card settings-home-card">
        <div className="card-header">
          <div>
            <p className="eyebrow">Workspace</p>
            <h2>Dashboard Layout</h2>
          </div>
          <Badge className="metric" variant="outline">
            {dashboardGridLayout.cols}x{dashboardGridLayout.rows}
          </Badge>
        </div>
        <div className="layout-options" aria-label="홈 대시보드 그리드 크기" role="radiogroup">
          {dashboardGridSizes.map((gridSize) => (
            <button
              aria-checked={dashboardGridLayout.cols === gridSize && dashboardGridLayout.rows === gridSize}
              className={
                dashboardGridLayout.cols === gridSize && dashboardGridLayout.rows === gridSize
                  ? "layout-option active"
                  : "layout-option"
              }
              key={gridSize}
              onClick={() => updateDashboardGridLayout({ cols: gridSize, rows: gridSize })}
              role="radio"
              type="button"
            >
              {gridSize}x{gridSize}
            </button>
          ))}
        </div>
        <div className="layout-custom" aria-label="홈 대시보드 커스텀 그리드">
          <p className="layout-custom-title">Custom</p>
          <label className="layout-custom-field">
            <span>Columns</span>
            <input
              aria-label="대시보드 열 수"
              max={dashboardGridMaxSize}
              min={1}
              onChange={(event) => updateDashboardGridPart("cols", event.target.value)}
              type="number"
              value={dashboardGridLayout.cols}
            />
          </label>
          <span className="layout-custom-divider">x</span>
          <label className="layout-custom-field">
            <span>Rows</span>
            <input
              aria-label="대시보드 행 수"
              max={dashboardGridMaxSize}
              min={1}
              onChange={(event) => updateDashboardGridPart("rows", event.target.value)}
              type="number"
              value={dashboardGridLayout.rows}
            />
          </label>
        </div>
      </section>

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
