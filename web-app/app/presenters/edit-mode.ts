export type EditMode<TDraft> =
    | { kind: 'reading' }
    | { kind: 'editing'; draft: TDraft };
