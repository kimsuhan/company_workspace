"use client";

import { CircleHelp, Eye, EyeOff, Pencil, PencilOff, Plus, RefreshCw, TestTube2, Trash2, X } from "lucide-react";
import type { FormEvent } from "react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type SlackSettings = {
  hasToken: boolean;
  tokenPreview: string | null;
};

type SlackListSource = {
  id: number;
  name: string;
  listId: string;
  fieldMapping: Record<string, unknown>;
  filterConfig: Record<string, unknown>;
  lastSyncAt: string | null;
  lastError: string | null;
};

type FieldMappingDraft = {
  id: string;
  key: string;
  label: string;
  columnId: string;
  type: string;
  sampleValue?: string;
  display: boolean;
  writable: boolean;
  role: FieldRole;
};

type FieldRole = "assignee" | "status" | "title" | "done" | "none";

type FilterDraft = {
  id: string;
  field: string;
  op: "eq" | "in" | "contains" | "exists";
  value: string;
};

const settingsUrl = "/api/slack/settings";
const settingsTestUrl = "/api/slack/settings/test";
const sourcesUrl = "/api/slack/lists/sources";
const fieldsPreviewUrl = "/api/slack/lists/fields/preview";
const fieldRoleOptions: { value: FieldRole; label: string }[] = [
  { value: "none", label: "없음" },
  { value: "title", label: "제목" },
  { value: "assignee", label: "담당자" },
  { value: "status", label: "상태" },
  { value: "done", label: "완료" },
];
const defaultFieldMappings: FieldMappingDraft[] = [
  { id: "field-title", key: "title", columnId: "Col...", type: "text", label: "제목", sampleValue: "", display: true, writable: false, role: "title" },
  { id: "field-status", key: "status", columnId: "Col...", type: "select", label: "상태", sampleValue: "", display: true, writable: true, role: "status" },
  { id: "field-assignee", key: "assignee", columnId: "Col...", type: "user", label: "담당자", sampleValue: "", display: true, writable: false, role: "assignee" },
];
const defaultFilterRules: FilterDraft[] = [
  { id: "filter-status", field: "status", op: "in", value: "미분류, API 작업중" },
];

export default function SettingsSlackPage() {
  const [settings, setSettings] = useState<SlackSettings>({ hasToken: false, tokenPreview: null });
  const [sources, setSources] = useState<SlackListSource[]>([]);
  const [tokenDraft, setTokenDraft] = useState("");
  const [nameDraft, setNameDraft] = useState("");
  const [listIdDraft, setListIdDraft] = useState("");
  const [fieldMappingDraft, setFieldMappingDraft] = useState<FieldMappingDraft[]>(defaultFieldMappings);
  const [filterConfigDraft, setFilterConfigDraft] = useState<FilterDraft[]>(defaultFilterRules);
  const [editingSourceId, setEditingSourceId] = useState<number | null>(null);
  const [isSourceFormOpen, setIsSourceFormOpen] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isListIdHelpOpen, setIsListIdHelpOpen] = useState(false);
  const [isFieldMappingHelpOpen, setIsFieldMappingHelpOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingToken, setIsSavingToken] = useState(false);
  const [isTestingToken, setIsTestingToken] = useState(false);
  const [isSavingSource, setIsSavingSource] = useState(false);
  const [isLoadingFields, setIsLoadingFields] = useState(false);

  useEffect(() => {
    void loadSlackSettings();
    void loadSources();
  }, []);

  const loadSlackSettings = async () => {
    const response = await fetch(settingsUrl);
    const result = (await response.json().catch(() => null)) as SlackSettings | null;

    if (response.ok && result) {
      setSettings(result);
    }
  };

  const loadSources = async () => {
    setIsLoading(true);
    setMessage(null);

    try {
      const response = await fetch(sourcesUrl);
      const result = (await response.json().catch(() => null)) as SlackListSource[] | { error?: string } | null;

      if (!response.ok || !Array.isArray(result)) {
        throw new Error(result && !Array.isArray(result) && result.error ? result.error : `Slack sources failed: ${response.status}`);
      }

      setSources(result);
    } catch (error) {
      setMessage(getErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  };

  const saveToken = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!tokenDraft.trim()) {
      setMessage("Slack token을 입력하세요.");
      return;
    }

    setIsSavingToken(true);
    setMessage(null);

    try {
      const response = await fetch(settingsUrl, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: tokenDraft.trim() }),
      });
      const result = (await response.json().catch(() => null)) as SlackSettings | { error?: string } | null;

      if (!response.ok || !result || "error" in result || !("hasToken" in result)) {
        throw new Error(result && "error" in result ? result.error : `Slack token save failed: ${response.status}`);
      }

      setSettings(result);
      setTokenDraft("");
    } catch (error) {
      setMessage(getErrorMessage(error));
    } finally {
      setIsSavingToken(false);
    }
  };

  const testToken = async () => {
    setIsTestingToken(true);
    setMessage(null);

    try {
      const response = await fetch(settingsTestUrl, { method: "POST" });
      const result = (await response.json().catch(() => null)) as { ok?: boolean; team?: string | null; user?: string | null; error?: string } | null;

      if (!response.ok || !result?.ok) {
        throw new Error(result?.error ?? `Slack token test failed: ${response.status}`);
      }

      setMessage(`토큰 테스트 성공 · ${result.team ?? "Slack"}${result.user ? ` · ${result.user}` : ""}`);
    } catch (error) {
      setMessage(getErrorMessage(error));
    } finally {
      setIsTestingToken(false);
    }
  };

  const saveSource = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!nameDraft.trim() || !listIdDraft.trim()) {
      setMessage("이름과 List ID를 입력하세요.");
      return;
    }

    setIsSavingSource(true);
    setMessage(null);

    try {
      const keyByDraftKey = new Map(fieldMappingDraft.map((field) => [field.key, createFieldKey(field.label || field.key || field.columnId)]));
      const body = {
        name: nameDraft.trim(),
        listId: listIdDraft.trim(),
        fieldMappings: fieldMappingDraft.map(({ id: _id, ...field }) => ({
          ...field,
          key: createFieldKey(field.label || field.key || field.columnId),
        })),
        filterRules: filterConfigDraft.map(({ id: _id, ...filter }) => ({
          ...filter,
          field: keyByDraftKey.get(filter.field) ?? filter.field,
        })),
      };
      const response = await fetch(editingSourceId === null ? sourcesUrl : `${sourcesUrl}/${editingSourceId}`, {
        method: editingSourceId === null ? "POST" : "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = (await response.json().catch(() => null)) as SlackListSource | { error?: string } | null;

      if (!response.ok || !result || "error" in result) {
        throw new Error(result && "error" in result ? result.error : `Slack source save failed: ${response.status}`);
      }

      await loadSources();
      closeSourceForm();
    } catch (error) {
      setMessage(getErrorMessage(error));
    } finally {
      setIsSavingSource(false);
    }
  };

  const testSource = async (source: SlackListSource) => {
    await runSourceAction(source, "test", "샘플 조회");
  };

  const syncSource = async (source: SlackListSource) => {
    await runSourceAction(source, "sync", "동기화");
  };

  const loadFieldsFromSlack = async () => {
    if (!listIdDraft.trim()) {
      setMessage("List ID 또는 링크를 입력하세요.");
      return;
    }

    setIsLoadingFields(true);
    setMessage(null);

    try {
      const response = await fetch(fieldsPreviewUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ listId: listIdDraft.trim() }),
      });
      const result = (await response.json().catch(() => null)) as {
        listId?: string;
        fields?: Omit<FieldMappingDraft, "id">[];
        labelSource?: "schema" | "csv" | "items";
        error?: string;
      } | null;

      if (!response.ok || !result || result.error) {
        throw new Error(result?.error ?? `필드 조회 실패: ${response.status}`);
      }

      if (!Array.isArray(result.fields) || result.fields.length === 0) {
        setMessage("샘플 항목에서 필드를 찾지 못했습니다. 필드를 직접 추가하세요.");
        return;
      }

      setListIdDraft(result.listId ?? listIdDraft.trim());
      setFieldMappingDraft(dedupeFieldRoles(result.fields.map((field) => ({ ...field, id: createDraftId("field"), role: normalizeFieldRole(field.role) || guessFieldRole(field) }))));
      setFilterConfigDraft((rows) => rows.map((row) => (result.fields?.some((field) => field.key === row.field) ? row : { ...row, field: result.fields?.[0]?.key ?? row.field })));
      setMessage(
        result.labelSource === "schema"
          ? `필드 ${result.fields.length}개를 불러왔습니다. Slack 스키마로 컬럼명을 채웠습니다.`
          : result.labelSource === "csv"
          ? `필드 ${result.fields.length}개를 불러왔습니다. Slack export 헤더로 컬럼명을 채웠습니다.`
          : `필드 ${result.fields.length}개를 불러왔습니다. Slack export 헤더를 못 받아 내부값 기준으로 표시했습니다.`,
      );
    } catch (error) {
      setMessage(getErrorMessage(error));
    } finally {
      setIsLoadingFields(false);
    }
  };

  const runSourceAction = async (source: SlackListSource, action: "test" | "sync", label: string) => {
    setMessage(null);

    try {
      const response = await fetch(`${sourcesUrl}/${source.id}/${action}`, { method: "POST" });
      const result = (await response.json().catch(() => null)) as { error?: string; count?: number } | unknown[] | null;

      if (!response.ok || (result && !Array.isArray(result) && "error" in result && result.error)) {
        throw new Error(result && !Array.isArray(result) && "error" in result ? result.error : `${label} 실패: ${response.status}`);
      }

      setMessage(Array.isArray(result) ? `${label} 완료 · ${result.length}개` : `${label} 완료 · ${result?.count ?? 0}개`);
      await loadSources();
    } catch (error) {
      setMessage(getErrorMessage(error));
    }
  };

  const deleteSource = async (source: SlackListSource) => {
    setMessage(null);

    try {
      const response = await fetch(`${sourcesUrl}/${source.id}`, { method: "DELETE" });

      if (!response.ok) {
        throw new Error(`Slack source delete failed: ${response.status}`);
      }

      await loadSources();
    } catch (error) {
      setMessage(getErrorMessage(error));
    }
  };

  const openNewSource = () => {
    setEditingSourceId(null);
    setNameDraft("");
    setListIdDraft("");
    setFieldMappingDraft(defaultFieldMappings.map((row) => ({ ...row })));
    setFilterConfigDraft(defaultFilterRules);
    setMessage(null);
    setIsSourceFormOpen(true);
  };

  const editSource = (source: SlackListSource) => {
    setEditingSourceId(source.id);
    setNameDraft(source.name);
    setListIdDraft(source.listId);
    setFieldMappingDraft(mappingToDraftRows(source.fieldMapping));
    setFilterConfigDraft(filterToDraftRows(source.filterConfig));
    setMessage(null);
    setIsSourceFormOpen(true);
  };

  const closeSourceForm = () => {
    setIsSourceFormOpen(false);
  };

  return (
    <div className="settings-layout settings-list-layout">
      <section className="dashboard-card settings-card" aria-labelledby="slack-settings-title">
        <div className="card-header">
          <div>
            <p className="eyebrow">Slack</p>
            <h2 id="slack-settings-title">Lists</h2>
          </div>
          <Button className="endpoint-add-button" type="button" onClick={openNewSource}>
            <Plus size={15} strokeWidth={1.8} />
            <span>리스트 추가</span>
          </Button>
        </div>

        <form className="settings-form" onSubmit={saveToken}>
          <div className="field">
            <div className="field-label-row">
              <span>Bot Token</span>
              <Button
                className="field-help-button field-help-icon"
                type="button"
                aria-label="Slack Bot Token 발급 안내"
                title="Slack Bot Token 발급 안내"
                onClick={() => setIsHelpOpen(true)}
              >
                <CircleHelp size={14} />
                <span className="sr-only">발급 안내</span>
              </Button>
            </div>
            <Input
              value={tokenDraft}
              onChange={(event) => setTokenDraft(event.target.value)}
              placeholder={settings.tokenPreview ?? "xoxb-..."}
              type="password"
            />
          </div>
          <div className="settings-form-footer">
            <Button className="primary-button" type="submit" disabled={isSavingToken || !tokenDraft.trim()}>
              {isSavingToken ? "저장 중" : settings.hasToken ? "토큰 교체" : "토큰 저장"}
            </Button>
            <p>{settings.hasToken ? `저장됨 · ${settings.tokenPreview}` : "저장된 토큰이 없습니다."}</p>
            <Button
              className="secondary-button compact-button"
              type="button"
              disabled={isTestingToken || !settings.hasToken}
              onClick={() => void testToken()}
            >
              {isTestingToken ? "테스트 중" : "토큰 테스트"}
            </Button>
          </div>
        </form>

        <div className="settings-site-list">
          {isLoading ? <p className="card-copy">Slack Lists를 불러오는 중입니다.</p> : null}
          {!isLoading && sources.length === 0 ? <p className="card-copy">등록된 Slack List가 없습니다.</p> : null}
          {sources.map((source) => (
            <article className="settings-site-item" key={source.id}>
              <span className="health-logo" aria-hidden="true">#</span>
              <div className="project-list-main">
                <strong>{source.name}</strong>
                <small>{source.listId}</small>
              </div>
              <div className="health-site-meta">
                <small>{source.lastSyncAt ? `Synced ${formatDateTime(source.lastSyncAt)}` : "Not synced"}</small>
                {source.lastError ? <small className="danger-text">{source.lastError}</small> : null}
              </div>
              <div className="settings-site-actions">
                <Button className="secondary-button compact-button" type="button" onClick={() => void testSource(source)}>
                  <span className="sr-only">샘플 조회</span>
                  <TestTube2 size={14} />
                </Button>
                <Button className="secondary-button compact-button" type="button" onClick={() => void syncSource(source)}>
                  <span className="sr-only">동기화</span>
                  <RefreshCw size={14} />
                </Button>
                <Button className="secondary-button compact-button" type="button" onClick={() => editSource(source)}>
                  수정
                </Button>
                <Button className="danger-button compact-button" type="button" onClick={() => void deleteSource(source)}>
                  삭제
                </Button>
              </div>
            </article>
          ))}
          {message ? <p className="settings-inline-message">{message}</p> : null}
        </div>
      </section>

      <Dialog open={isHelpOpen} onOpenChange={setIsHelpOpen}>
        <DialogContent className="settings-confirm-modal slack-help-modal" showCloseButton={false}>
          <div className="modal-header">
            <div>
              <p className="eyebrow">Slack Bot Token</p>
              <DialogTitle>Bot Token 발급</DialogTitle>
              <p className="modal-meta">Slack Lists를 읽고 상태를 바꾸려면 workspace에 설치한 Slack app의 Bot User OAuth Token이 필요합니다.</p>
            </div>
            <Button
              className="icon-button compact"
              type="button"
              aria-label="도움말 닫기"
              title="도움말 닫기"
              onClick={() => setIsHelpOpen(false)}
            >
              <X size={16} />
            </Button>
          </div>
          <ol className="slack-help-list">
            <li>
              <span>
                <a href="https://api.slack.com/apps" target="_blank" rel="noreferrer">
                  Slack API 페이지
                </a>
                에 접속해 <span className="help-ui-button">Create New App</span>을 클릭합니다.
              </span>
            </li>
            <li>
              <span><span className="help-ui-label">Create an app</span> 화면이 나오면 <span className="help-ui-button">From scratch</span>를 선택합니다.</span>
            </li>
            <li>
              <span><span className="help-ui-label">Name app & choose workspace</span> 화면에서 <span className="help-ui-label">App Name</span>에는 <span className="help-ui-code">Suhan Workspace</span>처럼 알아보기 쉬운 이름을 입력합니다.</span>
            </li>
            <li>
              <span><span className="help-ui-label">Select a workspace</span>에서 Slack List가 있는 workspace를 고른 뒤 <span className="help-ui-button">Create App</span>을 클릭합니다.</span>
            </li>
            <li>
              <span>좌측 메뉴에서 <span className="help-ui-label">OAuth & Permissions</span>를 선택하고, <span className="help-ui-label">봇 토큰 범위</span>에서 <span className="help-ui-button">OAuth 범위 추가</span>를 눌러 <span className="help-ui-code">lists:read</span>, <span className="help-ui-code">lists:write</span>를 추가합니다.</span>
            </li>
            <li>
              <span>좌측 메뉴에서 <span className="help-ui-label">Install App</span>을 선택한 뒤 <span className="help-ui-button">Install to Workspace Name</span> 버튼을 눌러 앱을 설치합니다.</span>
            </li>
            <li>
              <span>설치가 끝나면 표시되는 Bot User OAuth Token <span className="help-ui-code">xoxb-...</span>을 복사해 이 화면의 Bot Token에 붙여넣습니다.</span>
            </li>
          </ol>
        </DialogContent>
      </Dialog>

      <Dialog open={isSourceFormOpen} onOpenChange={(open) => (open ? setIsSourceFormOpen(true) : closeSourceForm())}>
        <DialogContent className="settings-modal" showCloseButton={false}>
          <div className="modal-header">
            <div>
              <p className="eyebrow">Slack List</p>
              <DialogTitle>{editingSourceId === null ? "Slack List 추가" : "Slack List 수정"}</DialogTitle>
              <p className="modal-meta">List ID 또는 Slack List 링크와 필드 매핑, 필터 JSON을 관리합니다.</p>
            </div>
          </div>
          <form className="settings-form" onSubmit={saveSource}>
            <Label className="field">
              <span>이름</span>
              <Input value={nameDraft} onChange={(event) => setNameDraft(event.target.value)} placeholder="[KJ] 고객 요청 사항" />
            </Label>
            <div className="field">
              <div className="field-label-row">
                <Label htmlFor="slack-list-id">List ID 또는 링크</Label>
                <Button
                  className="field-help-button field-help-icon"
                  type="button"
                  aria-label="Slack List ID 확인 안내"
                  title="Slack List ID 확인 안내"
                  onClick={() => setIsListIdHelpOpen(true)}
                >
                  <CircleHelp size={14} />
                  <span className="sr-only">확인 방법</span>
                </Button>
              </div>
              <div className="slack-list-id-row">
                <Input id="slack-list-id" value={listIdDraft} onChange={(event) => setListIdDraft(event.target.value)} placeholder="F... 또는 Slack List 링크" />
                <Button
                  className="secondary-button compact-button slack-field-action-button slack-load-fields-button is-active"
                  type="button"
                  disabled={isLoadingFields || !listIdDraft.trim()}
                  aria-label={isLoadingFields ? "필드 불러오는 중" : "필드 불러오기"}
                  title={isLoadingFields ? "필드 불러오는 중" : "필드 불러오기"}
                  onClick={() => void loadFieldsFromSlack()}
                >
                  <RefreshCw size={15} />
                  <span>{isLoadingFields ? "로딩" : "불러오기"}</span>
                </Button>
              </div>
            </div>
            <div className="slack-config-panel">
              <div className="slack-config-section-header">
                <div>
                  <div className="slack-section-title-row">
                    <span>필드 매핑</span>
                    <Button
                      className="field-help-button field-help-icon"
                      type="button"
                      aria-label="필드 매핑 입력 안내"
                      title="필드 매핑 입력 안내"
                      onClick={() => setIsFieldMappingHelpOpen(true)}
                    >
                      <CircleHelp size={14} />
                      <span className="sr-only">입력 방법</span>
                    </Button>
                  </div>
                  <p>Slack 컬럼을 우리 대시보드에서 쓸 이름으로 연결합니다.</p>
                </div>
              </div>
              <div className="slack-config-list">
                {fieldMappingDraft.map((field) => (
                  <div className="slack-config-row" key={field.id}>
                    <div className="slack-config-main">
                      <label>
                        <span>표시명</span>
                        <Input value={field.label} onChange={(event) => setFieldMappingDraft((rows) => updateRow(rows, field.id, { label: event.target.value }))} placeholder="표시명 제목" />
                      </label>
                      <div className="slack-field-meta-line">
                        <span title={field.columnId}>{field.columnId || "Column ID 없음"}</span>
                        <span>{field.type}</span>
                        <span title={field.sampleValue || "샘플 없음"}>샘플: {field.sampleValue || "없음"}</span>
                      </div>
                    </div>
                    <div className="slack-config-actions">
                      <label className="slack-role-select">
                        <span>역할</span>
                        <select
                          value={field.role}
                          onChange={(event) =>
                            setFieldMappingDraft((rows) => updateFieldRole(rows, field.id, event.target.value as FieldRole))
                          }
                        >
                          {fieldRoleOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <Button
                        className={`secondary-button compact-button slack-field-action-button ${field.display ? "is-active" : "is-muted"}`}
                        type="button"
                        aria-label={field.display ? "대시보드에 표시 중" : "대시보드 표시 안 함"}
                        title={field.display ? "표시 중" : "표시 안 함"}
                        onClick={() => setFieldMappingDraft((rows) => updateRow(rows, field.id, { display: !field.display }))}
                      >
                        {field.display ? <Eye size={15} /> : <EyeOff size={15} />}
                        <span>표시</span>
                      </Button>
                      <Button
                        className={`secondary-button compact-button slack-field-action-button ${field.writable ? "is-active" : "is-muted"}`}
                        type="button"
                        aria-label={field.writable ? "Slack 값 수정 허용 중" : "Slack 값 수정 안 함"}
                        title={field.writable ? "수정 허용" : "수정 안 함"}
                        onClick={() => setFieldMappingDraft((rows) => updateRow(rows, field.id, { writable: !field.writable }))}
                      >
                        {field.writable ? <Pencil size={15} /> : <PencilOff size={15} />}
                        <span>수정</span>
                      </Button>
                      <Button
                        className="secondary-button compact-button slack-field-action-button is-danger"
                        type="button"
                        aria-label="필드 삭제"
                        title="삭제"
                        onClick={() => setFieldMappingDraft((rows) => rows.filter((row) => row.id !== field.id))}
                      >
                        <Trash2 size={15} />
                        <span>삭제</span>
                      </Button>
                    </div>
                  </div>
                ))}
                <Button
                  className="secondary-button slack-field-add-button"
                  type="button"
                  aria-label="필드 수동 추가"
                  title="필드 수동 추가"
                  onClick={() => setFieldMappingDraft((rows) => [...rows, createEmptyFieldMapping()])}
                >
                  <Plus size={18} />
                </Button>
              </div>
            </div>
            <div className="slack-config-panel">
              <div className="slack-config-section-header">
                <div>
                  <span>필터</span>
                  <p>동기화할 항목만 남기고 싶을 때 조건을 추가합니다.</p>
                </div>
                <Button className="secondary-button compact-button" type="button" onClick={() => setFilterConfigDraft((rows) => [...rows, createEmptyFilterRule()])}>
                  필터 추가
                </Button>
              </div>
              <div className="slack-config-list">
                <div className="slack-filter-row slack-config-header" aria-hidden="true">
                  <span>필드 키</span>
                  <span>조건</span>
                  <span>값</span>
                  <span />
                </div>
                {filterConfigDraft.map((filter) => (
                  <div className="slack-filter-row" key={filter.id}>
                    <select value={filter.field} onChange={(event) => setFilterConfigDraft((rows) => updateRow(rows, filter.id, { field: event.target.value }))}>
                      <option value="">필드 선택</option>
                      {fieldMappingDraft.map((field) => (
                        <option key={field.id} value={createFieldKey(field.label || field.key || field.columnId)}>
                          {field.label || field.key}
                        </option>
                      ))}
                    </select>
                    <select value={filter.op} onChange={(event) => setFilterConfigDraft((rows) => updateRow(rows, filter.id, { op: event.target.value as FilterDraft["op"] }))}>
                      <option value="eq">같음</option>
                      <option value="in">포함</option>
                      <option value="contains">문자 포함</option>
                      <option value="exists">값 있음</option>
                    </select>
                    <Input
                      value={filter.value}
                      onChange={(event) => setFilterConfigDraft((rows) => updateRow(rows, filter.id, { value: event.target.value }))}
                      placeholder={filter.op === "in" ? "미분류, API 작업중" : "값"}
                      disabled={filter.op === "exists"}
                    />
                    <Button className="secondary-button compact-button slack-row-delete" type="button" aria-label="필터 삭제" onClick={() => setFilterConfigDraft((rows) => rows.filter((row) => row.id !== filter.id))}>
                      <X size={14} />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
            <div className="settings-form-footer">
              <Button className="primary-button" type="submit" disabled={isSavingSource || !nameDraft.trim() || !listIdDraft.trim()}>
                {isSavingSource ? "저장 중" : "저장"}
              </Button>
              <Button className="secondary-button" type="button" onClick={closeSourceForm}>
                취소
              </Button>
              {message ? <p>{message}</p> : null}
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={isListIdHelpOpen} onOpenChange={setIsListIdHelpOpen}>
        <DialogContent className="settings-confirm-modal slack-help-modal" showCloseButton={false}>
          <div className="modal-header">
            <div>
              <p className="eyebrow">Slack List</p>
              <DialogTitle>List ID 확인</DialogTitle>
              <p className="modal-meta">Slack List 링크를 그대로 넣어도 되고, 마지막 F로 시작하는 값만 넣어도 됩니다.</p>
            </div>
            <Button
              className="icon-button compact"
              type="button"
              aria-label="도움말 닫기"
              title="도움말 닫기"
              onClick={() => setIsListIdHelpOpen(false)}
            >
              <X size={16} />
            </Button>
          </div>
          <ol className="slack-help-list">
            <li>
              <span>Slack에서 연동할 List를 엽니다.</span>
            </li>
            <li>
              <span>상단 더보기 메뉴에서 <span className="help-ui-button">리스트 공유</span>를 클릭합니다.</span>
            </li>
            <li>
              <span>공유 창이 열리면 하단의 <span className="help-ui-button">링크 복사</span>를 클릭합니다.</span>
            </li>
            <li>
              <span>복사한 URL을 그대로 <span className="help-ui-label">List ID 또는 링크</span>에 붙여넣어도 됩니다.</span>
            </li>
            <li>
              <span>ID만 넣고 싶다면 URL 마지막의 <span className="help-ui-code">F...</span> 값을 사용합니다.</span>
            </li>
          </ol>
        </DialogContent>
      </Dialog>

      <Dialog open={isFieldMappingHelpOpen} onOpenChange={setIsFieldMappingHelpOpen}>
        <DialogContent className="settings-confirm-modal slack-help-modal" showCloseButton={false}>
          <div className="modal-header">
            <div>
              <p className="eyebrow">Slack List</p>
              <DialogTitle>필드 매핑 입력</DialogTitle>
              <p className="modal-meta">Slack 컬럼을 대시보드에서 볼 이름으로 연결합니다.</p>
            </div>
            <Button
              className="icon-button compact"
              type="button"
              aria-label="도움말 닫기"
              title="도움말 닫기"
              onClick={() => setIsFieldMappingHelpOpen(false)}
            >
              <X size={16} />
            </Button>
          </div>
          <ol className="slack-help-list">
            <li>
              <span>Slack 화면에서는 List 컬럼의 <span className="help-ui-label">Column ID</span>가 직접 보이지 않습니다. 직접 찾아 넣는 방식은 권장하지 않습니다.</span>
            </li>
            <li>
              <span>Column ID는 Slack API 응답의 <span className="help-ui-code">fields[].column_id</span> 값입니다.</span>
            </li>
            <li>
              <span>우리 화면에서는 <span className="help-ui-button">필드 불러오기</span>를 누르면 API 응답에서 Column ID를 읽어 자동으로 채웁니다.</span>
            </li>
            <li>
              <span>직접 확인하려면 Slack API로 해당 List item을 조회한 뒤 <span className="help-ui-code">fields[].column_id</span> 값을 봐야 합니다.</span>
            </li>
            <li>
              <span>일반적인 사용은 <span className="help-ui-button">필드 불러오기</span> 후 <span className="help-ui-label">표시명</span>만 고치는 방식이면 충분합니다.</span>
            </li>
            <li>
              <span><span className="help-ui-label">표시명</span>은 대시보드와 상세 모달에 보일 이름이고, <span className="help-ui-label">표시</span>/<span className="help-ui-label">수정</span>은 화면 노출과 Slack 값 변경 여부를 정합니다.</span>
            </li>
          </ol>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function createDraftId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createEmptyFieldMapping(): FieldMappingDraft {
  return { id: createDraftId("field"), key: "", columnId: "", type: "text", label: "", sampleValue: "", display: true, writable: false, role: "none" };
}

function createEmptyFilterRule(): FilterDraft {
  return { id: createDraftId("filter"), field: "", op: "eq", value: "" };
}

function createFieldKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, "_")
    .replace(/^_+|_+$/g, "") || "field";
}

function updateRow<T extends { id: string }>(rows: T[], id: string, patch: Partial<T>): T[] {
  return rows.map((row) => (row.id === id ? { ...row, ...patch } : row));
}

function updateFieldRole(rows: FieldMappingDraft[], id: string, role: FieldRole): FieldMappingDraft[] {
  return rows.map((row) => {
    if (row.id === id) {
      return { ...row, role };
    }

    return role !== "none" && row.role === role ? { ...row, role: "none" } : row;
  });
}

function mappingToDraftRows(value: Record<string, unknown>): FieldMappingDraft[] {
  const rows = Object.entries(value).flatMap(([key, config]) => {
    if (!config || typeof config !== "object" || Array.isArray(config)) {
      return [];
    }

    const field = config as Record<string, unknown>;
    const draft = {
        id: createDraftId("field"),
        key,
        columnId: typeof field.columnId === "string" ? field.columnId : "",
        type: typeof field.type === "string" ? field.type : "text",
        label: typeof field.label === "string" ? field.label : key,
        sampleValue: typeof field.sampleValue === "string" ? field.sampleValue : "",
        display: field.display !== false,
        writable: field.writable === true,
        role: normalizeFieldRole(field.role) || "none",
      };

    return [{ ...draft, role: draft.role === "none" ? guessFieldRole(draft) : draft.role }];
  });

  return rows.length > 0 ? dedupeFieldRoles(rows) : defaultFieldMappings.map((row) => ({ ...row }));
}

function dedupeFieldRoles(rows: FieldMappingDraft[]): FieldMappingDraft[] {
  const usedRoles = new Set<FieldRole>();

  return rows.map((row) => {
    if (row.role === "none" || usedRoles.has(row.role)) {
      return { ...row, role: "none" };
    }

    usedRoles.add(row.role);
    return row;
  });
}

function normalizeFieldRole(value: unknown): FieldRole | null {
  return value === "assignee" || value === "status" || value === "title" || value === "done" || value === "none" ? value : null;
}

function guessFieldRole(field: Pick<FieldMappingDraft, "key" | "label" | "type">): FieldRole {
  const type = field.type.toLowerCase();
  const label = `${field.key} ${field.label}`.toLowerCase();

  if (type === "user" && (label.includes("assignee") || label.includes("담당자") || label.includes("담당"))) {
    return "assignee";
  }

  if ((type === "checkbox" || type === "completed") && (label.includes("done") || label.includes("complete") || label.includes("완료"))) {
    return "done";
  }

  if (label.includes("status") || label.includes("상태")) {
    return "status";
  }

  if (label.includes("title") || label.includes("제목") || label.includes("요청_사항") || label.includes("요청사항") || label.includes("요청 내용") || label.includes("name")) {
    return "title";
  }

  return "none";
}

function filterToDraftRows(value: Record<string, unknown>): FilterDraft[] {
  const all = Array.isArray(value.all) ? value.all : [];
  const rows = all.flatMap((condition) => {
    if (!condition || typeof condition !== "object" || Array.isArray(condition)) {
      return [];
    }

    const item = condition as Record<string, unknown>;
    const op: FilterDraft["op"] = item.op === "eq" || item.op === "in" || item.op === "contains" || item.op === "exists" ? item.op : "eq";
    const rawValue = item.value;
    return [
      {
        id: createDraftId("filter"),
        field: typeof item.field === "string" ? item.field : "",
        op,
        value: Array.isArray(rawValue) ? rawValue.join(", ") : rawValue === undefined || rawValue === null ? "" : String(rawValue),
      },
    ];
  });

  return rows.length > 0 ? rows : defaultFilterRules.map((row) => ({ ...row }));
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "요청을 처리하지 못했습니다.";
}

function formatDateTime(date: string): string {
  return new Date(date).toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
