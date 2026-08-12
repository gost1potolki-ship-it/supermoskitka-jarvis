export type KnowledgeRuleStatus = 'draft' | 'approved' | 'rejected';

export type KnowledgeRuleCategory =
  | 'sales'
  | 'products'
  | 'measurement'
  | 'installation'
  | 'delivery-payment'
  | 'warranty'
  | 'safety'
  | 'operations';

export type KnowledgeSourceType =
  | 'owner'
  | 'business-audit'
  | 'real-dialogue'
  | 'document'
  | 'learning-correction';

export interface KnowledgeSource {
  type: KnowledgeSourceType;
  reference?: string;
  note?: string;
}

export interface KnowledgeRuleVersion {
  version: number;
  condition: string;
  instruction: string;
  reason?: string;
  responseTemplate?: string;
  source: KnowledgeSource;
  createdAt: string;
  approvedAt?: string;
}

export interface KnowledgeRule {
  id: string;
  title: string;
  category: KnowledgeRuleCategory;
  status: KnowledgeRuleStatus;
  activeVersion: number;
  versions: KnowledgeRuleVersion[];
  tags: string[];
}

export function getActiveRuleVersion(rule: KnowledgeRule): KnowledgeRuleVersion {
  const version = rule.versions.find((item) => item.version === rule.activeVersion);
  if (!version) {
    throw new Error(
      `Active version ${rule.activeVersion} not found for knowledge rule ${rule.id}`,
    );
  }
  return version;
}
