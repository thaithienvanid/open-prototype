---
version: alpha
name: {{name}}
colors:
  primary: "#1d4ed8"
  light:
    surface: "#fafafb"
    surface-raised: "#f3f4f5"
    text: "#1c1e21"
    text-muted: "#5b616b"
    border: "#858b94"
    accent: "#1d4ed8"
  dark:
    surface: "#111317"
    surface-raised: "#1c1e21"
    text: "#dfe2e6"
    text-muted: "#b0b6bf"
    border: "#6b717a"
    accent: "#93c5fd"
typography:
  body:
    fontFamily: system-ui, sans-serif
    fontSize: 1rem
    fontWeight: 400
    lineHeight: 1.5
  field:
    fontFamily: system-ui, sans-serif
    fontSize: 1rem
    fontWeight: 400
    lineHeight: 1.5
rounded:
  control: 0.5rem
spacing:
  "2": 0.5rem
  "3": 1rem
  target: 2.75rem
motion:
  state-change:
    duration: 150ms
    timingFunction: ease-out
---

## Overview

Write who uses the product, for what, and how it should feel to them, in two or three sentences.

## Colors

Write what each colour is for, and why: the surfaces, the text, the borders, and the one accent.

## Typography

Write the type a person reads, and where each size and weight is used.
Text is 14 px (`body`), as most apps set it, with headings and figures larger. A form field's text is 16 px on a phone (`field`), because iOS Safari zooms the page when a focused field's text is smaller, and 14 px from a tablet's width up.
A brand font's files sit in the project, and an `@font-face` in a tokens file loads them.

## Layout

Write the spacing scale and the grid, and the smallest target a person can press.

## Elevation & Depth

Write how a layer stands above another: a border, and a shadow only for a floating layer.

## Shapes

Write the corner radii, and what each shape means.

## Motion & Micro-interaction

Write what moves, how fast, and that it stops when a person asks for reduced motion.

## Voice & Content Strategy

Write how the product speaks: its tone, its words for things, and the words it never uses.

## Components

Write each component the product has, by the name its code gives it, with its variants and states.

## Do's and Don'ts

- Do keep text at a contrast of at least 4.5:1 against what it stands on.
- Do carry each meaning in words or a shape too, never in colour alone.
- Do keep everything still when a person asks for reduced motion.
- Don't let anything play by itself, or flash.
- Do keep surfaces flat by default: one fill each, with no gradient or texture. This is the starter's default, and a project's own document decides its style.
- Don't give a layer a shadow unless it floats, and give a floating layer a border too.
- Do draw every state: empty, loading, failed, offline, and not allowed.
