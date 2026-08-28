---
layout: ../layouts/MarkdownLayout.astro
title: "About the dictionary data"
description: "Core entities and interpretation rules used by the public dictionary interface."
---

The dictionary database keeps lexical entities separate from their documentary attestations.

## Core levels

1. **`chinese`** represents a Chinese character as a lexical/graphic entity.
2. **`rom`** represents a historical romanization or reading form.
3. **`chinese_rom`** represents one reusable character + romanization pairing.
4. **`occ`** represents one documentary occurrence of that pairing at a specific dictionary locus.

The public **Dictionary entries** page is occurrence-centred: each displayed row corresponds to an `occ` record. The **Chinese characters** section groups those occurrences by `chinese` entity.

## Stroke counts

Two different concepts are exposed and must not be conflated:

- **Historical strokes** = `occ.n_strokes`, the count used by the historical dictionary's own indexing system.
- **Modern strokes** = `chinese.strokes`, the modern/standard character count.

The boolean `occ.stroke` is not a stroke count; it marks the first printed locus of a new stroke-count section.

## Occurrence roles

The occurrence typology preserves the editorial role of readings and definitions on the printed line, including principal entries, alternatives, variants, and alternatives to variants.

This first public layer deliberately does not yet expose the more complex graphic-variant and synonym-relation subsystems. Those can be added later without changing the basic occurrence and character browsing model.
