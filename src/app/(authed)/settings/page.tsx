"use client";

import type { Settings } from "@/domain";
import { TIMELINE_DEFAULTS } from "@/domain";
import { useSettings } from "@/hooks/useSettings";
import { saveSettings } from "@/repositories/settings";
import { db } from "@/lib/firebase/client";
import { defaultSettings } from "@/lib/defaults/settings";
import { LoadingState } from "@/components/shared/LoadingState";
import { NapDefaultsEditor } from "@/components/Settings/NapDefaultsEditor";
import { DreamFeedEditor } from "@/components/Settings/DreamFeedEditor";
import { WakeWindowsEditor } from "@/components/Settings/WakeWindowsEditor";
import { PumpTimesEditor } from "@/components/Settings/PumpTimesEditor";
import { BottleRulesEditor } from "@/components/Settings/BottleRulesEditor";
import { TimelineDisplayEditor } from "@/components/Settings/TimelineDisplayEditor";
import { SettingsAccount } from "@/components/Settings/SettingsAccount";
import styles from "./page.module.css";

const CHILD_ID = process.env.NEXT_PUBLIC_DEFAULT_CHILD_ID ?? "aden";

export default function SettingsPage() {
  const { settings, loading } = useSettings(CHILD_ID);

  if (loading) {
    return (
      <div className={styles.page}>
        <LoadingState label="Loading settings" />
      </div>
    );
  }

  // First-run: no settings doc yet — render editors against sane defaults.
  // The first save creates the doc; the watcher then keeps things in sync.
  const value: Settings = settings ?? defaultSettings(CHILD_ID);
  const persist = (next: Settings) => {
    void saveSettings(db, CHILD_ID, next);
  };

  return (
    <div className={styles.page}>
      <h1 className={styles.heading}>Settings</h1>

      <NapDefaultsEditor
        value={{
          defaultNapLengthMinutes: value.defaultNapLengthMinutes,
          shortNapThresholdMinutes: value.shortNapThresholdMinutes,
          shortNapAdjustmentMinutes: value.shortNapAdjustmentMinutes,
          bedtimeThreshold: value.bedtimeThreshold,
          putdownLeadMinutes: value.putdownLeadMinutes,
        }}
        onChange={(next) => persist({ ...value, ...next })}
      />

      <WakeWindowsEditor
        value={value.wakeWindowsMinutes}
        onChange={(next) => persist({ ...value, wakeWindowsMinutes: next })}
      />

      <BottleRulesEditor
        value={{
          defaultBottleAmountOz: value.defaultBottleAmountOz,
          defaultBottleIntervalMinutes: value.defaultBottleIntervalMinutes,
          bottleRules: value.bottleRules,
        }}
        onChange={(next) => persist({ ...value, ...next })}
      />

      <DreamFeedEditor
        value={value.dreamFeed}
        onChange={(next) => persist({ ...value, dreamFeed: next })}
      />

      <PumpTimesEditor
        value={value.pumpTimes}
        onChange={(next) => persist({ ...value, pumpTimes: next })}
      />

      <TimelineDisplayEditor
        value={{
          colorMode: value.timelineColorMode ?? TIMELINE_DEFAULTS.colorMode,
          pxPerHour: value.timelinePxPerHour ?? TIMELINE_DEFAULTS.pxPerHour,
          dimPast: value.timelineDimPast ?? TIMELINE_DEFAULTS.dimPast,
        }}
        onChange={(next) =>
          persist({
            ...value,
            timelineColorMode: next.colorMode,
            timelinePxPerHour: next.pxPerHour,
            timelineDimPast: next.dimPast,
          })
        }
      />

      <SettingsAccount />
    </div>
  );
}
