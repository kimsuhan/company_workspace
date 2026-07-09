import assert from "node:assert/strict";
import { test } from "node:test";

import {
  applyCsvHeadersToFieldPreviews,
  applySlackListSchemaToFieldPreviews,
  buildSlackUpdateCells,
  getAssignedSlackUserIds,
  getMappedTitle,
  getSlackFieldRoles,
  getSlackBackoffUntil,
  inferSlackListFieldPreviews,
  isSlackListItemDone,
  isSlackListItemInProgress,
  mapSlackItemToMappedFields,
  maskSlackToken,
  matchesSlackListFilter,
  parseSlackListCsvHeader,
  parseCsvHeaderRow,
  type SlackMappedField,
  type SlackListFieldMapping,
  parseSlackListId,
  readSlackListSourceInput,
} from "./slack-lists.js";

const mapping: Record<string, SlackListFieldMapping> = {
  title: { columnId: "ColTitle", type: "text", label: "제목", display: true },
  status: {
    columnId: "ColStatus",
    type: "select",
    label: "상태",
    optionLabels: { OptStatusTodo: "미분류", OptStatusApi: "API 작업중" },
    display: true,
    writable: true,
  },
  assignee: { columnId: "ColAssignee", type: "user", label: "담당자", display: true },
};

test("mapSlackItemToMappedFields prefers column_id and extracts display values", () => {
  const fields = mapSlackItemToMappedFields(
    {
      id: "Rec1",
      list_id: "F1",
      date_created: 1_783_072_800,
      fields: [
        { key: "status", column_id: "OtherColumn", value: "wrong" },
        { key: "title_fallback", column_id: "ColTitle", text: "업무위탁수수료 지급관련" },
        { key: "status", column_id: "ColStatus", select: ["OptStatusTodo"] },
        { key: "assignee", column_id: "ColAssignee", value: "U1", user: ["U1"], text: "김수한" },
      ],
    },
    mapping,
  );

  assert.equal(fields.title.value, "업무위탁수수료 지급관련");
  assert.equal(fields.status.value, "미분류");
  assert.equal(fields.assignee.value, "김수한");
});

test("matchesSlackListFilter supports eq, in, contains, and exists", () => {
  const fields = {
    title: { label: "제목", value: "업무위탁수수료 지급관련", type: "text", display: true, writable: false, columnId: "ColTitle" },
    status: { label: "상태", value: "미분류", type: "select", display: true, writable: true, columnId: "ColStatus" },
    site: { label: "사이트", value: "GB 관리자", type: "text", display: true, writable: false, columnId: "ColSite" },
  };

  assert.equal(
    matchesSlackListFilter(fields, {
      all: [
        { field: "status", op: "in", value: ["미분류", "API 작업중"] },
        { field: "site", op: "eq", value: "GB 관리자" },
        { field: "title", op: "contains", value: "수수료" },
        { field: "title", op: "exists" },
      ],
    }),
    true,
  );
  assert.equal(matchesSlackListFilter(fields, { all: [{ field: "status", op: "eq", value: "완료" }] }), false);
});

test("buildSlackUpdateCells only builds writable mapped cell updates", () => {
  assert.deepEqual(buildSlackUpdateCells(mapping, "Rec1", { status: "API 작업중" }), [
    { row_id: "Rec1", column_id: "ColStatus", select: ["OptStatusApi"] },
  ]);
  assert.throws(() => buildSlackUpdateCells(mapping, "Rec1", { title: "수정" }), /title is not writable/);
});

test("maskSlackToken hides secret body", () => {
  assert.equal(maskSlackToken(null), null);
  assert.equal(maskSlackToken("xoxb-123456789012"), "xoxb...9012");
});

test("getSlackBackoffUntil reads retry-after first", () => {
  assert.equal(
    getSlackBackoffUntil(
      new Headers({
        "retry-after": "5",
      }),
      1_783_072_800_000,
    )?.toISOString(),
    "2026-07-03T10:00:05.000Z",
  );
});

test("parseSlackListId accepts ids and Slack list URLs", () => {
  assert.equal(parseSlackListId("F093EH44RPV"), "F093EH44RPV");
  assert.equal(parseSlackListId("https://forlong.slack.com/lists/T066G3K50MU/F093EH44RPV"), "F093EH44RPV");
  assert.equal(parseSlackListId("https://forlong.slack.com/list?list_id=F093EH44RPV"), "F093EH44RPV");
  assert.throws(() => parseSlackListId("https://forlong.slack.com/lists/T066G3K50MU"), /listId/);
});

test("readSlackListSourceInput converts UI rows to stored JSON config", () => {
  const input = readSlackListSourceInput({
    name: "고객 요청",
    listId: "https://forlong.slack.com/lists/T066G3K50MU/F093EH44RPV",
    fieldMappings: [
      {
        key: "status",
        label: "상태",
        columnId: "ColStatus",
        type: "select",
        sampleValue: "API 작업중",
        optionLabels: { OptStatusApi: "API 작업중" },
        inProgressValues: ["API 작업중"],
        doneValues: ["처리완료"],
        display: true,
        writable: true,
      },
    ],
    filterRules: [
      { field: "status", op: "in", value: "미분류, API 작업중" },
      { field: "title", op: "exists" },
    ],
  });

  assert.equal(input.listId, "F093EH44RPV");
  assert.deepEqual(input.fieldMapping, {
    status: {
      columnId: "ColStatus",
      type: "select",
      label: "상태",
      sampleValue: "API 작업중",
      optionLabels: { OptStatusApi: "API 작업중" },
      inProgressValues: ["API 작업중"],
      doneValues: ["처리완료"],
      display: true,
      writable: true,
    },
  });
  assert.deepEqual(input.filterConfig, {
    all: [
      { field: "status", op: "in", value: ["미분류", "API 작업중"] },
      { field: "title", op: "exists" },
    ],
  });
});

test("readSlackListSourceInput keeps one mapping role per Slack list", () => {
  const input = readSlackListSourceInput({
    name: "고객 요청",
    listId: "F093EH44RPV",
    fieldMappings: [
      { key: "assignee", label: "담당자", columnId: "ColAssignee", type: "user", role: "assignee" },
      { key: "owner", label: "작성자", columnId: "ColOwner", type: "user", role: "assignee" },
      { key: "done", label: "완료됨", columnId: "ColDone", type: "checkbox", role: "done" },
      { key: "title", label: "요청 사항", columnId: "ColTitle", type: "text", role: "title" },
    ],
  });

  assert.deepEqual(input.fieldMapping, {
    assignee: { columnId: "ColAssignee", type: "user", label: "담당자", sampleValue: undefined, display: true, writable: false, role: "assignee" },
    owner: { columnId: "ColOwner", type: "user", label: "작성자", sampleValue: undefined, display: true, writable: false },
    done: { columnId: "ColDone", type: "checkbox", label: "완료됨", sampleValue: undefined, display: true, writable: false, role: "done" },
    title: { columnId: "ColTitle", type: "text", label: "요청 사항", sampleValue: undefined, display: true, writable: false, role: "title" },
  });
});

test("role helpers read title, assignee, status, and done fields", () => {
  const fields: Record<string, SlackMappedField> = {
    status: { label: "상태", value: "API 작업중", type: "select", display: true, writable: false, columnId: "ColStatus", role: "status" },
    assignee: { label: "담당자", value: ["U0675BWGM6E", "U08HELASRED"], type: "user", display: true, writable: false, columnId: "ColAssignee", role: "assignee" },
    done: { label: "완료됨", value: false, type: "checkbox", display: true, writable: false, columnId: "ColDone", role: "done" },
    title: { label: "요청 사항", value: "BM 관련 기능 요청", type: "text", display: true, writable: false, columnId: "ColTitle", role: "title" },
  };

  assert.equal(getMappedTitle(fields), "BM 관련 기능 요청");
  assert.deepEqual(getSlackFieldRoles(fields), { assignee: "assignee", status: "status", title: "title", done: "done" });
  assert.deepEqual(getAssignedSlackUserIds(fields), ["U0675BWGM6E", "U08HELASRED"]);
  assert.equal(isSlackListItemDone(fields), false);
  assert.equal(isSlackListItemDone({ ...fields, done: { ...fields.done, value: true } }), true);
});

test("isSlackListItemDone treats configured status values as done", () => {
  const fields: Record<string, SlackMappedField> = {
    status: { label: "상태", value: "처리완료", type: "select", display: true, writable: false, columnId: "ColStatus", role: "status" },
  };

  assert.equal(isSlackListItemDone(fields, { status: { role: "status", doneValues: ["처리완료"] } }), true);
  assert.equal(isSlackListItemDone(fields, { status: { role: "status", doneValues: ["API 작업중"] } }), false);
});

test("isSlackListItemInProgress uses configured status values when present", () => {
  const fields: Record<string, SlackMappedField> = {
    status: { label: "상태", value: "API 작업중", type: "select", display: true, writable: false, columnId: "ColStatus", role: "status" },
  };

  assert.equal(isSlackListItemInProgress(fields, { status: { role: "status", inProgressValues: ["API 작업중"] } }), true);
  assert.equal(isSlackListItemInProgress(fields, { status: { role: "status", inProgressValues: ["처리완료"] } }), false);
  assert.equal(isSlackListItemInProgress(fields, { status: { role: "status" } }), true);
});

test("inferSlackListFieldPreviews builds mapping rows from sample item fields", () => {
  assert.deepEqual(
    inferSlackListFieldPreviews([
      {
        id: "Rec1",
        list_id: "F1",
        fields: [
          { key: "col093g7ggejj", column_id: "ColStatus", select: ["미분류"] },
          { key: "담당자", column_id: "ColAssignee", user: ["U1"] },
          { key: "col093g7ggejj", column_id: "ColStatus", select: ["중복"] },
          { key: "todo_due_date", column_id: "ColDueDate", date: ["2026-07-31"] },
        ],
      },
    ]),
    [
      { key: "컬럼_1", label: "컬럼 1", columnId: "ColStatus", type: "select", sampleValue: "미분류", display: true, writable: false },
      { key: "담당자", label: "담당자", columnId: "ColAssignee", type: "user", sampleValue: "U1", display: true, writable: false },
      { key: "마감_기한", label: "마감 기한", columnId: "ColDueDate", type: "date", sampleValue: "2026-07-31", display: true, writable: false },
    ],
  );
});

test("parseCsvHeaderRow reads quoted Slack export headers", () => {
  assert.deepEqual(parseCsvHeaderRow('\uFEFF"요청사항, 상세",상태,"담당자 ""주 담당"""\n본문,미분류,김수한'), [
    "요청사항, 상세",
    "상태",
    '담당자 "주 담당"',
  ]);
});

test("parseSlackListCsvHeader ignores Slack HTML download pages", () => {
  assert.deepEqual(parseSlackListCsvHeader("<!DOCTYPE html><html><head></head><body>Slack</body></html>"), []);
});

test("applyCsvHeadersToFieldPreviews replaces inferred labels with export headers", () => {
  assert.deepEqual(
    applyCsvHeadersToFieldPreviews(
      [
        { key: "컬럼_1", label: "컬럼 1", columnId: "Col01", type: "user", sampleValue: "U1", display: true, writable: false },
        { key: "제목", label: "제목", columnId: "ColTitle", type: "text", sampleValue: "업무", display: true, writable: false },
      ],
      ["담당자", "요청사항 상세"],
    ),
    [
      { key: "담당자", label: "담당자", columnId: "Col01", type: "user", sampleValue: "U1", display: true, writable: false },
      { key: "요청사항_상세", label: "요청사항 상세", columnId: "ColTitle", type: "text", sampleValue: "업무", display: true, writable: false },
    ],
  );
});

test("applySlackListSchemaToFieldPreviews uses Slack schema names and keeps samples by column id", () => {
  assert.deepEqual(
    applySlackListSchemaToFieldPreviews(
      [
        { key: "컬럼_1", label: "컬럼 1", columnId: "Col01", type: "user", sampleValue: "U1", display: true, writable: false },
        { key: "제목", label: "제목", columnId: "ColTitle", type: "text", sampleValue: "업무", display: true, writable: false },
        { key: "컬럼_3", label: "컬럼 3", columnId: "ColStatus", type: "select", sampleValue: "Opt1", display: true, writable: false },
      ],
      [
        { id: "ColTitle", name: "요청사항 상세", key: "name", type: "text" },
        { id: "Col01", name: "담당자", key: "assignee", type: "todo_assignee" },
        { id: "ColStatus", name: "상태", key: "status", type: "select", options: { choices: [{ value: "Opt1", label: "미분류" }] } },
      ],
    ),
    [
      { key: "name", label: "요청사항 상세", columnId: "ColTitle", type: "text", sampleValue: "업무", display: true, writable: false },
      { key: "assignee", label: "담당자", columnId: "Col01", type: "user", sampleValue: "U1", display: true, writable: false },
      {
        key: "status",
        label: "상태",
        columnId: "ColStatus",
        type: "select",
        sampleValue: "미분류",
        optionLabels: { Opt1: "미분류" },
        display: true,
        writable: false,
      },
    ],
  );
});
