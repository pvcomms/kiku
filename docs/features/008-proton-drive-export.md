---
title: Copy every finished reading into Proton Drive
status: shipped
created: 2026-09-20
---

# 008 — Copy every finished reading into Proton Drive

## Why

A reading lives in `~/Kiku/` on the machine that made it. The phone reaches it over the LAN
or the tailnet, which means the machine has to be awake and reachable. The person wants the
readings themselves to travel — on the phone, on the iPad, on whichever Mac — end to end
encrypted, with nobody in between but Proton, whose sync folder is already on this machine.

## What changes

- Before: readings stayed in `~/Kiku/audio/`.
- After: each finished reading is also copied into `<Proton Drive>/Kiku/Audio/`. The copy is
  a separate step after the reading is done, retried on boot and every fifteen minutes, and
  never fails a reading. `/health` names the folder or says copies are off; the page marks
  each copied reading; `POST /api/export/reconcile` forces a sweep.

## Where

| File                  | Change                                                                                 |
| --------------------- | -------------------------------------------------------------------------------------- |
| `src/export.ts`       | new. `resolveExportDir()`, `exportFile()` (copy to `.part`, rename), `reconcile()`     |
| `src/library.ts`      | `Item.exportedAt`                                                                      |
| `src/server.ts`       | `exportItems()` after each item, on boot, every 15 min; the reconcile route; `/health` |
| `src/preflight.ts`    | a `proton drive` check at level `want`                                                 |
| `src/ui.ts`           | `proton` on a copied row                                                               |
| `test/export.test.ts` | new                                                                                    |

## Out of scope

Reading anything back from the folder. Merging two machines' libraries. Deleting a copy when
a reading is removed here — the folder is an archive, and what is in it is the person's to
prune. Anything but Proton Drive's own sync folder: kiku writes a file into a directory and
Proton does the rest, so there is no Proton API, no token, no second network path.

## Acceptance checks

```bash
pnpm test                                                        # green, includes export.test.ts
curl -s localhost:4747/health | grep -o '"exportDir":"[^"]*"'    # the Kiku folder under CloudStorage
bin/kiku "a short reading to prove the copy lands"
sleep 20; ls ~/Library/CloudStorage/ProtonDrive-*-folder/Kiku/Audio/ | tail -1   # the new mp3
curl -s -X POST localhost:4747/api/export/reconcile              # {"copied":[],"present":[…],"failed":[]}
```

- [ ] With the folder renamed away, a reading still completes and `/health` says copies are off
- [ ] Renaming it back and forcing a sweep copies what was missed
- [ ] The copy opens in the Proton Drive app on the phone

## Ran — 2026-09-20, on the Studio

`pnpm test` → 51 pass. `/health` → `exportDir: …/ProtonDrive-pvcomms@pm.me-folder/Kiku`.
On restart the boot sweep copied all five readings (78 MB) into `Kiku/Audio/` before the
forced `POST /api/export/reconcile` ran, which then reported all five `present`, none failed.
Every item carries `exportedAt`; the page marks each row `proton`. The drawing from 009
landed in `Kiku/Artifacts/` four seconds after it was written (`[kiku] exported …html`).

Not run: the rename-the-folder-away test and the phone-side check in the Proton Drive app.
