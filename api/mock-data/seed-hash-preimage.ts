// Preimages of reminted seed ids. Hash keys in scores.ts
// use these so deterministicScore draws match the pinned
// 92 actuals / 1453 pairs. T4 leftover. Do not use as
// domain identifiers.

export const SEED_HASH_PREIMAGE: Readonly<
    Record<string, string>
> = {
    'GNRUyOMVpjoeEQWrZkRMkQ': 'CvH4wRnXkU1pQsBgTyEzMo',
    'JobGWBxUTEBusPcVhYEKtA': 'JkW7aEqFdX3nOiPtVhMrCy',
    'kAxUZTXdcMCAttuoyCdSYA': 'jRE2Tj32NHsFGZIeEADp0p',
    'MBITVgcXjXZiQkMeFSivxg': 'L2cP01SalesPip3l1n3L01',
    'ObmAspkIgRMWsTRDWpkSUw': 'P07Empl0yTrainZyXY00B0',
    'OfgrTrJuepfpmOSjtBhrYA': 'P08CustSuppKn0wXY01C0D',
    'OjDbHdsCibzUBZCSRSqucw': 'P09C0mp1AudAut0mXY01E0',
    'OmGoTHQFHRevqlrGWPgtKA': 'P10MlRgD1s4stRc1XY01FG',
    'ORXAfsQvNowpmJfBwQAtWg': 'P04PredMa1ntzyXY010203',
    'OTmPQEfeyDzqGNOmlFSUMw': 'P05RtAna1ytcsXY010203Z',
    'OtSStAjEiIerCMcUwNgMbQ': 'P11V0iceField0psXY01HJ',
    'OvIEhORMAYZxBcQZKkgkow': 'P12CarbF00tprXY01K0L0M',
    'OvJSmafViYCdfyAIdgzJTQ': 'P13W0rk4rcF0r3castsXY1',
    'OXxlaOFaAWfVofOqOHeTrQ': 'P06SmInvOptZyXY010203A',
    'PGtnaoTOuWCcbADPrancjA': 'P14SmartD0cumtR0utngX1',
    'PIfhHMLQQxTxKFDdabXbOw': 'P16MktSent1mentXY01020',
    'PIImLccwpnfvbBBMsIKoMA': 'P15Inv3st0rRep0rtP1Y00',
    'QVZjTYvKwffyfGpYILwkOA': 'RgT2mNvKpQ8xLsYwBzHcUe',
    'VhxqyRIQytSnUArslwxyog': 'bDf6uStZlA9eGmYjIoNcWq',
    'wqGTTFdYUGnmBxWCppmkOQ': 'u6YkHhlGc91oDMkr3x0isa',
};

export function seedHashKey(id: string): string {
    const prior = SEED_HASH_PREIMAGE[id];
    if (prior === undefined) return id;
    return prior;
}
