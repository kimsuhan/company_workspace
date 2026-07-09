# Slack Lists Integration

## Purpose

Slack Lists sources let the dashboard read list items from Slack, store mapped values locally, and optionally write selected cells back to Slack. The integration is intentionally dynamic: each source owns its list ID, filter rules, field mapping, and write policy.

## Bot Token

- Store the Slack Bot User OAuth Token from Settings UI, not `.env`.
- API responses must never return the raw token. Return only `hasToken` and masked status.
- The Slack app should have both bot token scopes: `lists:read` and `lists:write`.
- v1 assumes one Slack workspace token with multiple Slack Lists sources.

## List Source

- The List ID input accepts either a raw list ID such as `F093EH44RPV` or a Slack List URL such as `https://forlong.slack.com/lists/T066G3K50MU/F093EH44RPV`.
- If a URL is provided, normalize and store only the final `F...` list ID.
- Users register list sources manually. Automatic list discovery is not part of v1.

## Field Preview

Field preview should be generated from Slack instead of requiring users to inspect hidden column IDs.

1. Call `slackLists.items.list` with the normalized list ID to fetch sample items.
2. Call `slackLists.items.info` for a sample item and read `list_metadata.schema` when Slack returns it.
3. Prefer schema column names and schema field types over inferred labels from raw item cells.
4. Use item cell values only as samples. For select fields, map option IDs to human-readable option labels when schema choices are available.
5. Keep CSV/download parsing as a fallback only. If Slack returns an HTML page instead of CSV content, ignore it and rely on API metadata.

## Stored Mapping

Each field mapping is stored as JSON so the backend can keep dynamic behavior while the frontend remains form-based.

```json
{
  "status": {
    "columnId": "Col093PARL336",
    "type": "select",
    "label": "상태",
    "sampleValue": "API 작업중",
    "optionLabels": {
      "Opt01": "미분류",
      "Opt02": "API 작업중",
      "Opt03": "처리완료"
    },
    "role": "status",
    "inProgressValues": ["API 작업중"],
    "doneValues": ["처리완료"],
    "display": true,
    "writable": true
  }
}
```

- `columnId`: Slack column ID used for reads and writes.
- `type`: normalized local type such as `text`, `select`, `user`, `date`, or `checkbox`.
- `label`: dashboard/settings display name. Users can edit this freely.
- `sampleValue`: preview-only value for Settings UI. It helps users recognize the field when editing later and is not used for filtering or writes.
- `optionLabels`: optional select option ID-to-label map from Slack schema. Settings UI uses these labels when users configure filters and status values.
- `role`: optional dashboard role. Supported values are `title`, `assignee`, `status`, and `none`. One Slack List source keeps only one field per role.
- `inProgressValues`: optional status labels treated as active work when `role` is `status`.
- `doneValues`: optional status labels treated as completed work when `role` is `status`.
- `display`: whether the field appears in dashboard cards and item detail.
- `writable`: whether the field may be updated through `slackLists.items.update`.

## Filters

- Store filters as backend JSON, but expose them as UI controls based on the selected field mappings.
- Supported local operators are `eq`, `in`, `contains`, and `exists`.
- Select fields should use option pickers instead of free text when `optionLabels` are available.
- Multiple values inside one `in` filter are OR. Multiple filter rows are AND.
- Apply filters after Slack items are fetched and before local persistence.

## Updates

- Only fields marked `writable: true` can be sent back to Slack.
- Update payloads must use Slack cell IDs/column IDs from the mapping.
- Failed Slack writes should leave the local item unchanged and surface the Slack error to the user.

## UI Rules

- The List ID field uses one input group: the text input owns the outer border, and the field-load action sits inline at the right without its own nested button border.
- Field mapping rows show the editable display name first.
- Column ID, inferred type, and sample value appear as compact meta chips below the display field.
- Select field options are edited from the row option action. Option labels should be mapped once and reused by filters and status configuration.
- Display, edit, and delete controls use equal-size icon buttons. Use eye/eye-off for display, pencil/pencil-off for writable, and trash for delete.
- Manual field creation sits at the bottom of the field list as a full-width `+` button.
- The settings form order is field mapping, filters, then dashboard connection.
- Dashboard connection maps `title`, `assignee`, and `status` to Slack fields. Status value pickers for in-progress and done states should use the status filter values when a status `in` filter exists; otherwise they may use all mapped select labels.
- Help for finding list IDs or column IDs appears as a small circular `?` icon beside the relevant label.
