export interface SupportedAsylumReadingRule {
  title: string;
  body: string;
}

export const supportedAsylumReadingRules: SupportedAsylumReadingRule[] = [
  {
    title: "Quarter-end stock, not throughput",
    body: "Supported asylum counts show how many people were receiving support at the end of the period. They are not new claims, arrivals, or the number of distinct people seen across the period."
  },
  {
    title: "Processing and exits move the stock",
    body: "The stock changes when people enter support and when they leave it through case progression, including grants, refusals, withdrawals, departures, or moves out of the published support categories."
  },
  {
    title: "Flat local lines can still hide churn",
    body: "A place hovering around the same level can mean low movement, or heavy turnover with inflows offset by exits. The published local tables do not show how many different people passed through support in that area."
  }
];

export function buildSupportedAsylumStockDescription(
  latestPeriodLabel: string,
  hasIllustrativeData = false
): string {
  return `Quarter-end stock series to ${latestPeriodLabel}. A rise or fall is a net change in the number of people on support at period end, not the number of new claims or distinct people moving through the caseload.${hasIllustrativeData ? " Illustrative bridge points are still visible between official anchors." : ""}`;
}
