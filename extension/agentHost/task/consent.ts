import type { Category } from '../../privacy/categoryTypes';
import { classOf } from '../../privacy/policy';
import type { SceneGraph } from '../../scene';
import type { PrivacySession } from '../session';

export interface ConsentRequest { origin: string; medium: Category[]; high: Category[]; credential: boolean }
export interface ConsentReply { categories: Category[]; credentialToken?: string }
export function consentRequest(scene: SceneGraph, session: PrivacySession): ConsentRequest {
  const categories = new Set(session.taskCategories);
  for (const el of scene.elements.values()) if (el.fieldCategory) categories.add(el.fieldCategory);
  return { origin: scene.page.origin,
    medium: [...categories].filter(c => ['medium', 'quasi'].includes(classOf(c))),
    high: [...categories].filter(c => classOf(c) === 'high'),
    credential: categories.has('PASSWORD'),
  };
}
