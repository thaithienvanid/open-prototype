---
version: alpha
name: Inbox
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
  title:
    fontFamily: system-ui, sans-serif
    fontSize: 1.5rem
    fontWeight: 600
    lineHeight: 1.25
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
components:
  message-row:
    padding: "{spacing.3}"
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.light.surface}"
    rounded: "{rounded.control}"
  button-secondary:
    textColor: "{colors.light.accent}"
    rounded: "{rounded.control}"
---

## Overview

Inbox is the shared mailbox of a small support team. It should feel calm and quick: a person clears it between calls.

## Colors

One accent marks the action that moves work on. Everything else is surface, text, and border.

## Typography

The system font, at 1rem for reading and 1.5rem for a screen's title.

## Layout

A spacing scale of 0.5rem and 1rem, and no target smaller than 2.75rem.

## Elevation & Depth

Flat: a layer stands apart by its border. Only a floating menu has a shadow.

## Shapes

Controls have a 0.5rem radius. Rows are square.

## Motion & Micro-interaction

A state change fades in 150ms, and nothing moves under reduced motion.

## Voice & Content Strategy

Plain and short. A message is a "conversation", never a "ticket". Say what happened, then the one next step.

## Components

- `message-row`: one conversation in the list, with its sender, subject, and time.
- `button-primary`: the one action of a screen. `button-secondary`: every other action.

## Do's and Don'ts

- Do keep text at a contrast of at least 4.5:1.
- Don't carry a meaning in colour alone.
