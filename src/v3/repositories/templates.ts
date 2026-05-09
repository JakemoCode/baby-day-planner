/**
 * V3 templates repository.
 * Path-compatible with V2 (`children/{childId}/templates/{templateId}`).
 * Wire shape: V3 OwnershipTemplate uses slot-based OwnerRefs.
 */

import { collection, deleteDoc, doc, getDocs, setDoc, type Firestore } from "firebase/firestore";
import { templatePath, templatesCollectionPath } from "@/lib/firestore/paths";
import { v3TemplateConverter } from "../firestore/converters";
import type { OwnershipTemplate } from "../schemas";

function templateRef(db: Firestore, childId: string, templateId: string) {
  return doc(db, templatePath(childId, templateId)).withConverter(v3TemplateConverter);
}

function templatesRef(db: Firestore, childId: string) {
  return collection(db, templatesCollectionPath(childId)).withConverter(v3TemplateConverter);
}

export async function saveTemplate(
  db: Firestore,
  childId: string,
  template: OwnershipTemplate,
): Promise<void> {
  await setDoc(templateRef(db, childId, template.id), template);
}

export async function listTemplates(db: Firestore, childId: string): Promise<OwnershipTemplate[]> {
  const snap = await getDocs(templatesRef(db, childId));
  return snap.docs.map((d) => d.data());
}

export async function deleteTemplate(
  db: Firestore,
  childId: string,
  templateId: string,
): Promise<void> {
  await deleteDoc(templateRef(db, childId, templateId));
}
