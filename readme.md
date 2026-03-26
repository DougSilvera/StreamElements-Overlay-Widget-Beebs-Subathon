# Jungle Subathon Overlay (StreamElements)

A **StreamElements custom widget** for running a subathon with:

- ⏱ **Subathon timer**
- 🌿 **Jungle growth visual progression**
- 🎯 **Sub milestone tracker**
- 🛠 **Moderator control commands**
- 🔧 **Optional debug HUD**

The overlay automatically reacts to **subscription events** and updates the jungle progression and milestone tracker.

---

# Files in This Repository


html.html → Widget HTML
css.css → Widget styles
js.js → Widget logic


These files should be pasted into a **StreamElements Custom Widget**.

---

# Installation

## 1. Create an Overlay

In StreamElements:


Dashboard
→ Streaming Tools
→ Overlays
→ New Overlay


---

## 2. Add a Custom Widget

Inside the overlay:


Add Widget
→ Static / Custom
→ Custom Widget


---

## 3. Paste the Files

Open the widget editor and paste:

| Widget Tab | File |
|-------------|------|
| **HTML** | `html.html` |
| **CSS** | `css.css` |
| **JS** | `js.js` |

Save the widget.

---

## 4. Add Overlay to OBS

Copy the overlay URL from StreamElements and add it as a **Browser Source** in OBS.

---

# Subathon Commands (Mods / Broadcaster)

These commands are restricted to **moderators and the broadcaster**.

## Start / Stop

Start a subathon:


!subathon start


Stop the subathon:


!subathon stop


Check status:


!subathon status


---

## Adjust Subs

Add subs:


!subathon +5


Remove subs:


!subathon -2


---

## Timer Controls

Set start time:


!subathon setstart 19:30


Set end time:


!subathon setend 2026-03-04 22:00


Set duration from start:


!subathon setduration 18


Set end time relative to now:


!subathon setendin 6


---

# HUD Commands (Debug Panel)

Toggle HUD:


!hud


Force HUD on:


!hud on


Force HUD off:


!hud off


The HUD is **hidden by default**.

---

# Jungle Progression

The jungle artwork evolves as subs increase.

| Subs | Level |
|-----|------|
| 5 | Seed |
| 20 | Sprout |
| 45 | Overgrown |
| 60 | Wild |
| 100 | Carnivorous |
| 200 | Untamed |
| 250 | Savage |

---

# Milestone Rewards

| Goal | Reward |
|-----|------|
| 5 | In Game Challenge |
| 20 | Chat Picks Skin |
| 45 | Chat Picks Dinner |
| 60 | $$ Customs Tournament |
| 100 | 24h Unlock + Giveaway |
| 200 | Pie in the Face |
| 250 | Momster Tattoo |

---

# Automatic Subscription Tracking

The widget automatically increments the sub counter when StreamElements receives:

- New subs
- Resubs
- Gifted subs
- Multi-gifts

Mods **do not need to manually update subs** unless correcting a value.

---

# Assets

Jungle artwork is loaded from:


assets/


in this repository.

---

# Notes

- Designed for **StreamElements Custom Widgets**
- Works with **OBS Browser Sources**
- HUD is intended for **debugging and mod control only**

---

# License

Free to use and modify.