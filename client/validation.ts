export type ValidationResult<P> = {
    ready: boolean;
    problems: P[];
};
