"use client";

import type { OwnershipTemplate, Settings } from "@/domain";
import { useSettings } from "@/hooks/useSettings";
import { useTemplates } from "@/hooks/useTemplates";
import { saveSettings } from "@/repositories/settings";
import { saveTemplate } from "@/repositories/templates";
import { db } from "@/lib/firebase/client";
import { LoadingState } from "@/components/shared/LoadingState";
import { NapDefaultsEditor } from "@/components/Settings/NapDefaultsEditor";
import { DreamFeedEditor } from "@/components/Settings/DreamFeedEditor";
import { WakeWindowsEditor } from "@/components/Settings/WakeWindowsEditor";
import { PumpTimesEditor } from "@/components/Settings/PumpTimesEditor";
import { BottleRulesEditor } from "@/components/Settings/BottleRulesEditor";
import { WeekendTemplateEditor } from "@/components/Settings/WeekendTemplateEditor";
import { SettingsAccount } from "@/components/Settings/SettingsAccount";
import styles from "./page.module.css";

const CHILD_ID = process.env.NEXT_PUBLIC_DEFAULT_CHILD_ID ?? "aden";

const SATURDAY_ID = "tmpl-saturday";
const SUNDAY_ID = "tmpl-sunday";

const DEFAULT_SAT: OwnershipTemplate = {
  id: SATURDAY_ID,
  label: "Saturday",
  napOwners: [],
  wakeWindowOwners: [],
};

const DEFAULT_SUN: OwnershipTemplate = {
  id: SUNDAY_ID,
  label: "Sunday",
  napOwners: [],
  wakeWindowOwners: [],
};

export default function SettingsPage() {
  const { settings, loading } = useSettings(CHILD_ID);
  const { templates } = useTemplates(CHILD_ID);

  if (loading || !settings) {
    return (
      <div className={styles.page}>
        <LoadingState label="Loading settings" />
      </div>
    );
  }

  const persist = (next: Settings) => {
    void saveSettings(db, CHILD_ID, next);
  };

  const saturday = templates.find((t) => t.id === SATURDAY_ID) ?? DEFAULT_SAT;
  const sunday = templates.find((t) => t.id === SUNDAY_ID) ?? DEFAULT_SUN;

  const persistTemplates = (sat: OwnershipTemplate, sun: OwnershipTemplate) => {
    void saveTemplate(db, CHILD_ID, sat);
    void saveTemplate(db, CHILD_ID, sun);
  };

  return (
    <div className={styles.page}>
      <h1 className={styles.heading}>Settings</h1>

      <NapDefaultsEditor
        value={{
          defaultNapLengthMinutes: settings.defaultNapLengthMinutes,
          shortNapThresholdMinutes: settings.shortNapThresholdMinutes,
          shortNapAdjustmentMinutes: settings.shortNapAdjustmentMinutes,
          bedtimeThreshold: settings.bedtimeThreshold,
          putdownLeadMinutes: settings.putdownLeadMinutes,
        }}
        onChange={(next) => persist({ ...settings, ...next })}
      />

      <WakeWindowsEditor
        value={settings.wakeWindowsMinutes}
        onChange={(next) => persist({ ...settings, wakeWindowsMinutes: next })}
      />

      <BottleRulesEditor
        value={{
          defaultBottleAmountOz: settings.defaultBottleAmountOz,
          defaultBottleIntervalMinutes: settings.defaultBottleIntervalMinutes,
          bottleRules: settings.bottleRules,
        }}
        onChange={(next) => persist({ ...settings, ...next })}
      />

      <DreamFeedEditor
        value={settings.dreamFeed}
        onChange={(next) => persist({ ...settings, dreamFeed: next })}
      />

      <PumpTimesEditor
        value={settings.pumpTimes}
        onChange={(next) => persist({ ...settings, pumpTimes: next })}
      />

      <WeekendTemplateEditor
        saturday={saturday}
        sunday={sunday}
        slotCount={settings.wakeWindowsMinutes.length}
        onChange={(sat, sun) => persistTemplates(sat, sun)}
      />

      <SettingsAccount />
    </div>
  );
}
