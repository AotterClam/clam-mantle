import type { TemplateRegistry } from "../../domain/model/TemplateRegistry.js";
import type { PublishOrchestrator } from "../../domain/port/PublishOrchestrator.js";
import type { SiteConfigRepository } from "../../domain/port/SiteConfigRepository.js";

export interface ContentPublishEffects {
  readonly publishOrchestrator: PublishOrchestrator;
  readonly siteConfig: SiteConfigRepository;
  readonly templates: TemplateRegistry;
}

export async function publishCache(
  effects: ContentPublishEffects | undefined,
  entryId: string,
): Promise<void> {
  if (!effects) return;
  const site = await effects.siteConfig.load();
  await effects.publishOrchestrator.publish({
    entryId,
    site,
    templates: effects.templates,
  });
}

export async function unpublishCache(
  effects: ContentPublishEffects | undefined,
  entryId: string,
): Promise<void> {
  if (!effects) return;
  const site = await effects.siteConfig.load();
  await effects.publishOrchestrator.unpublish({
    entryId,
    site,
    templates: effects.templates,
  });
}
