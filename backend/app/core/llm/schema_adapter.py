"""Convert Pydantic/JSON-Schema output into the subset Gemini's responseSchema accepts."""

import copy

# Keys with no meaning in Gemini's responseSchema (OpenAPI 3.0 subset).
_DROP_KEYS = {"additionalProperties", "$defs", "title", "default"}
_NULL = {"type": "null"}


def to_gemini_schema(schema: dict) -> dict:
    schema = copy.deepcopy(schema)
    defs = schema.get("$defs", {})
    return _clean(schema, defs, frozenset())


def _clean(node, defs, seen):
    if isinstance(node, list):
        return [_clean(v, defs, seen) for v in node]
    if not isinstance(node, dict):
        return node

    if "$ref" in node:
        name = node["$ref"].split("/")[-1]
        if name in seen:
            return {"type": "object"}
        target = defs.get(name)
        if target is None:
            return _clean({k: v for k, v in node.items() if k != "$ref"}, defs, seen)
        merged = {**target, **{k: v for k, v in node.items() if k != "$ref"}}
        return _clean(merged, defs, seen | {name})

    # Optional field: `[T, null]` collapses to T + nullable, keeping sibling keys
    # (notably `description`) that steer extraction.
    for key in ("anyOf", "oneOf"):
        entries = node.get(key)
        if isinstance(entries, list) and len(entries) == 2 and _NULL in entries:
            other = entries[0] if entries[1] == _NULL else entries[1]
            cleaned = _clean(other, defs, seen)
            if not isinstance(cleaned, dict):
                return cleaned
            siblings = {
                k: _clean(v, defs, seen)
                for k, v in node.items()
                if k != key and k not in _DROP_KEYS
            }
            return {**cleaned, **siblings, "nullable": True}

    # Gemini rejects `allOf`; shallow-merge its cleaned entries into the node,
    # with the node's own keys taking precedence.
    if isinstance(node.get("allOf"), list):
        rest = {k: v for k, v in node.items() if k != "allOf"}
        combined: dict = {}
        for entry in node["allOf"]:
            cleaned_entry = _clean(entry, defs, seen)
            if isinstance(cleaned_entry, dict):
                combined.update(cleaned_entry)
        combined.update(_clean(rest, defs, seen))
        return combined

    result = {}
    for k, v in node.items():
        if k in _DROP_KEYS:
            continue
        if k == "properties" and isinstance(v, dict):
            result[k] = {pk: _clean(pv, defs, seen) for pk, pv in v.items()}
        elif k in ("anyOf", "oneOf") and isinstance(v, list):
            result[k] = [_clean(e, defs, seen) for e in v]
        elif k == "items":
            result[k] = _clean(v, defs, seen)
        elif isinstance(v, (dict, list)):
            result[k] = _clean(v, defs, seen)
        else:
            result[k] = v
    return result
