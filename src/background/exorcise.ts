// Exorcise: block a tracker company's domains for one tab with declarativeNetRequest session rules.
// The MV3 worker can be killed at any time, so the rule-id counter and the tab+company → rule id
// map live in chrome.storage.session, not in memory.
import { exorcisedKey, RULE_SEQ_KEY } from "../data/types";

/** company → DNR rule id */
type Rules = Record<string, number>;

export class Exorcist {
  // Calls read and then write storage.session, so they run one at a time.
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private api: typeof chrome) {}

  private serial<T>(job: () => Promise<T>): Promise<T> {
    const run = this.queue.then(job);
    this.queue = run.catch(() => {});
    return run;
  }

  /** Block `domains` (and their subdomains) in `tabId`; replaces the company's earlier rule. False on failure. */
  exorcise(tabId: number, company: string, domains: string[]): Promise<boolean> {
    if (!domains.length) return Promise.resolve(false);
    return this.serial(async () => {
      const key = exorcisedKey(tabId);
      const stored = await this.api.storage.session.get([key, RULE_SEQ_KEY]);
      const rules = (stored[key] ?? {}) as Rules;
      const id = ((stored[RULE_SEQ_KEY] as number | undefined) ?? 0) + 1;
      await this.api.storage.session.set({ [RULE_SEQ_KEY]: id });
      await this.api.declarativeNetRequest.updateSessionRules({
        removeRuleIds: company in rules ? [rules[company]!] : [],
        addRules: [{ id, priority: 1, action: { type: "block" }, condition: { requestDomains: domains, tabIds: [tabId] } }],
      });
      await this.api.storage.session.set({ [key]: { ...rules, [company]: id } });
      return true;
    }).catch(() => false);
  }

  /** Unblock one company in `tabId`. Errors are swallowed. */
  letBack(tabId: number, company: string): Promise<void> {
    return this.serial(async () => {
      const key = exorcisedKey(tabId);
      const rules = ((await this.api.storage.session.get(key))[key] ?? {}) as Rules;
      if (!(company in rules)) return;
      await this.api.declarativeNetRequest.updateSessionRules({ removeRuleIds: [rules[company]!] });
      const { [company]: _gone, ...rest } = rules;
      await this.api.storage.session.set({ [key]: rest });
    }).catch(() => {});
  }

  /** Remove every session rule aimed at `tabId`. Errors are swallowed. */
  clearTab(tabId: number): Promise<void> {
    return this.serial(async () => {
      const rules = await this.api.declarativeNetRequest.getSessionRules();
      const removeRuleIds = rules.filter((r) => r.condition.tabIds?.includes(tabId)).map((r) => r.id);
      if (removeRuleIds.length) await this.api.declarativeNetRequest.updateSessionRules({ removeRuleIds });
      await this.api.storage.session.remove(exorcisedKey(tabId));
    }).catch(() => {});
  }

  /** Companies currently exorcised in `tabId`, by name. */
  async exorcised(tabId: number): Promise<string[]> {
    const key = exorcisedKey(tabId);
    return Object.keys(((await this.api.storage.session.get(key))[key] ?? {}) as Rules).sort();
  }
}
