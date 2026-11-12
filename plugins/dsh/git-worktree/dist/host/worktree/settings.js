/**
 * 用户在面板里改的设置：目前只有分支前缀。
 *
 * 和插件 Config 分开的理由：Config 是部署方的静态声明，改一次要重载插件；
 * 分支前缀是「这个仓库/这个团队怎么命名」的日常偏好，应该当场可改。所以它落在
 * 状态目录里的一份小 JSON 上，读坏了就退回默认值，不让配置问题拖垮创建。
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { DEFAULT_BRANCH_PREFIX } from "../shared/paths.js";
export { DEFAULT_BRANCH_PREFIX };
export class WorktreeSettingsStore {
    file;
    constructor(file) {
        this.file = file;
    }
    read() {
        try {
            if (!existsSync(this.file))
                return { branchPrefix: DEFAULT_BRANCH_PREFIX };
            const parsed = JSON.parse(readFileSync(this.file, 'utf8'));
            return {
                branchPrefix: typeof parsed.branchPrefix === 'string' ? parsed.branchPrefix : DEFAULT_BRANCH_PREFIX,
            };
        }
        catch {
            /* 读不动的设置按默认值处理：它不该挡住建检出。 */
            return { branchPrefix: DEFAULT_BRANCH_PREFIX };
        }
    }
    write(value) {
        mkdirSync(dirname(this.file), { recursive: true });
        const temporary = `${this.file}.tmp`;
        writeFileSync(temporary, JSON.stringify(value, null, 2), { mode: 0o600 });
        try {
            renameSync(temporary, this.file);
        }
        catch {
            /* Windows 上偶发占用：退化为直接覆盖，仍是完整写入。 */
            writeFileSync(this.file, JSON.stringify(value, null, 2), { mode: 0o600 });
        }
    }
}
