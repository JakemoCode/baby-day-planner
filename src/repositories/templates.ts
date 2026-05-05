import { collection, deleteDoc, doc, getDocs, setDoc, type Firestore } from "firebase/firestore";
import type { OwnershipTemplate } from "@/domain";
import { templateConverter } from "@/lib/firestore/converters";
import { templatePath, templatesCollectionPath } from "@/lib/firestore/paths";

function templateRef(db: Firestore, childId: string, templateId: string) {
  return doc(db, templatePath(childId, templateId)).withConverter(templateConverter);
}

function templatesRef(db: Firestore, childId: string) {
  return collection(db, templatesCollectionPath(childId)).withConverter(templateConverter);
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
