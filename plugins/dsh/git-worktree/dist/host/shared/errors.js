export class DomainError extends Error {
    code;
    constructor(code, message) {
        super(message !== undefined && message !== '' ? message : code);
        this.name = 'DomainError';
        this.code = code;
    }
}
/** 把任意异常收成一条可读文本；分类仍由 `DomainError` 承担。 */
export function describe(error) {
    if (error instanceof Error)
        return error.message;
    return String(error);
}
