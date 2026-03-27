# Subathon Overlay (StreamElements)

A **StreamElements custom widget** for running a subathon with:

-   ⏱ **Dynamic subathon timer (6h → 12h → 24h)**
-   🎯 **Milestone reward tracker**
-   📈 **Automatic subscription tracking (subs, resubs, gifts)**
-   🛠 **Moderator control commands**
-   🔍 **Built-in event logging for verification/debugging**

This overlay is designed to be **accurate, deterministic, and
resilient** to StreamElements event quirks.

------------------------------------------------------------------------

# Files in This Repository

    html.html → Widget HTML
    css.css   → Widget styles
    js.js     → Widget logic

These files should be pasted into a **StreamElements Custom Widget**.

------------------------------------------------------------------------

# Installation

## 1. Create an Overlay

In StreamElements:

    Dashboard
    → Streaming Tools
    → Overlays
    → New Overlay

------------------------------------------------------------------------

## 2. Add a Custom Widget

Inside the overlay:

    Add Widget
    → Static / Custom
    → Custom Widget

------------------------------------------------------------------------

## 3. Paste the Files

Open the widget editor and paste:

  Widget Tab   File
  ------------ -------------
  HTML         `html.html`
  CSS          `css.css`
  JS           `js.js`

Save the widget.

------------------------------------------------------------------------

## 4. Add Overlay to OBS

Copy the overlay URL and add it as a **Browser Source** in OBS.

------------------------------------------------------------------------

# Subathon Behavior

## Timer Logic

The timer is based on **stream start time**, not incremental extensions.

  Subs      Timer Behavior
  --------- ------------------------------------
  `< 5`     Timer hidden (`--:--:--`)
  `≥ 5`     6-hour countdown becomes visible
  `≥ 70`    Upgrades to 12-hour total duration
  `≥ 150`   Upgrades to 24-hour total duration

Important:

-   The timer always counts down from **start time → target duration**
-   Upgrading tiers **extends the end time if needed**, never shortens
    it
-   Timer remains hidden until 5 subs but still runs in the background

------------------------------------------------------------------------

## Milestone Tracker

Displays:

-   Current subs
-   Next milestone goal
-   Reward description

Example:

    12 / 15
    Next unlock: Alien Onesie

------------------------------------------------------------------------

# Subscription Tracking (Important)

The widget handles StreamElements events correctly and avoids common
pitfalls:

### ✅ Counted

-   New subscriptions → `+1`
-   Resubscriptions → `+1` (ignores month count)
-   Direct gifted subs → `+1`
-   Community gift purchases → `+N` (bundle amount)

### ❌ Ignored

-   Gift recipient follow-up events
-   `subscriber-latest` events
-   Duplicate events

------------------------------------------------------------------------

# Moderator Commands

## Start / Stop

    !subathon start
    !subathon stop
    !subathon status

## Adjust Subs

    !subathon +5
    !subathon -2

## Time Controls

    !subathon setstart 19:30
    !subathon setend 2026-03-04 22:00

------------------------------------------------------------------------

# Milestone Rewards

  Goal   Reward
  ------ ---------------------------
  5      6 hour stream
  10     Camera on
  15     Alien Onesie
  20     Chamoy Pickle
  25     Creative Games + Giveaway
  30     Harmonica Coms
  50     Bieber Costume
  55     Bieber Karaoke
  70     12 Hours unlocked
  100    Movie night in discord
  150    24 Hours
  200    Resident Evil 7

------------------------------------------------------------------------

# Debug Logging

The widget includes **console logging for all sub events**:

-   Incoming events
-   Classification (counted / ignored)
-   Amount applied

------------------------------------------------------------------------

# Notes

-   Built for **StreamElements Custom Widgets**
-   Designed for **OBS Browser Source usage**
-   Fully event-driven

------------------------------------------------------------------------

# License

Free to use and modify.
