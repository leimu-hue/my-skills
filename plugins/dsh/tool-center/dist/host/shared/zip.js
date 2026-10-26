/**
 * 极简 ZIP 读写（零依赖）。
 *
 * 为什么手写：DSH 插件的 Host 半侧不该背一棵运行时依赖树。被替换的插件为了导入导出专门
 * 装了 `fflate`；这里需要的子集大约 200 行，而且可以单测。
 *
 * 支持：store（0）与 deflate（8）、UTF-8 文件名；不支持加密、ZIP64、多卷。其余情况抛一条
 * 面板能直接显示的错。条目路径会做校验（不允许绝对路径、不允许 `..`），这样恶意压缩包
 * 逃不出目标目录。
 */
import { deflateRawSync, inflateRawSync } from 'node:zlib';
const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;
const ZIP64_MARKER_16 = 0xffff;
const ZIP64_MARKER_32 = 0xffffffff;
// CRC32 表与浏览器侧 src/client/core/zip.ts 完全一致；两侧各自打包，改动时两处一起改。
const CRC_TABLE = (() => {
    const table = new Int32Array(256);
    for (let index = 0; index < 256; index += 1) {
        let value = index;
        for (let bit = 0; bit < 8; bit += 1) {
            value = (value & 1) !== 0 ? (value >>> 1) ^ 0xedb88320 : value >>> 1;
        }
        table[index] = value;
    }
    return table;
})();
export function crc32(data) {
    let crc = -1;
    for (let index = 0; index < data.length; index += 1) {
        crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ data[index]) & 0xff];
    }
    return (crc ^ -1) >>> 0;
}
/** 把一个 zip 读进内存。 */
export function readZip(buffer, options = {}) {
    const maxTotalBytes = options.maxTotalBytes ?? 64 * 1024 * 1024;
    const maxEntryBytes = options.maxEntryBytes ?? 16 * 1024 * 1024;
    const maxEntries = options.maxEntries ?? 2000;
    const eocd = findEndOfCentralDirectory(buffer);
    if (eocd < 0)
        throw new Error('不是有效的 zip：找不到中央目录结尾');
    const total = buffer.readUInt16LE(eocd + 10);
    const centralSize = buffer.readUInt32LE(eocd + 12);
    const centralOffset = buffer.readUInt32LE(eocd + 16);
    if (total === ZIP64_MARKER_16 || centralOffset === ZIP64_MARKER_32) {
        throw new Error('不支持 ZIP64（请用普通 zip 重新打包）');
    }
    if (total > maxEntries)
        throw new Error(`条目过多（${total} > ${maxEntries}）`);
    if (centralOffset + centralSize > buffer.length)
        throw new Error('zip 中央目录越界');
    const files = [];
    let cursor = centralOffset;
    let totalBytes = 0;
    for (let index = 0; index < total; index += 1) {
        if (cursor + 46 > buffer.length)
            throw new Error('zip 中央目录被截断');
        if (buffer.readUInt32LE(cursor) !== CENTRAL_SIGNATURE)
            throw new Error('zip 中央目录签名不正确');
        const method = buffer.readUInt16LE(cursor + 10);
        const compressedSize = buffer.readUInt32LE(cursor + 20);
        const uncompressedSize = buffer.readUInt32LE(cursor + 24);
        const nameLength = buffer.readUInt16LE(cursor + 28);
        const extraLength = buffer.readUInt16LE(cursor + 30);
        const commentLength = buffer.readUInt16LE(cursor + 32);
        const localOffset = buffer.readUInt32LE(cursor + 42);
        const nameStart = cursor + 46;
        const name = decodeName(buffer.subarray(nameStart, nameStart + nameLength));
        cursor = nameStart + nameLength + extraLength + commentLength;
        if (name.endsWith('/'))
            continue;
        assertSafeZipPath(name);
        if (compressedSize === ZIP64_MARKER_32 || uncompressedSize === ZIP64_MARKER_32) {
            throw new Error('不支持 ZIP64 条目');
        }
        if (uncompressedSize > maxEntryBytes)
            throw new Error(`条目过大：${name}`);
        totalBytes += uncompressedSize;
        if (totalBytes > maxTotalBytes)
            throw new Error('压缩包解压后过大');
        if (localOffset + 30 > buffer.length)
            throw new Error(`zip 本地头越界：${name}`);
        if (buffer.readUInt32LE(localOffset) !== LOCAL_SIGNATURE)
            throw new Error(`zip 本地头签名不正确：${name}`);
        const localNameLength = buffer.readUInt16LE(localOffset + 26);
        const localExtraLength = buffer.readUInt16LE(localOffset + 28);
        const dataStart = localOffset + 30 + localNameLength + localExtraLength;
        const raw = buffer.subarray(dataStart, dataStart + compressedSize);
        if (raw.length !== compressedSize)
            throw new Error(`zip 条目被截断：${name}`);
        let data;
        if (method === 0)
            data = Buffer.from(raw);
        else if (method === 8) {
            try {
                data = inflateRawSync(raw, { maxOutputLength: maxEntryBytes });
            }
            catch (cause) {
                throw new Error(`解压失败：${name}（${String(cause.message ?? cause)}）`);
            }
        }
        else {
            throw new Error(`不支持的压缩方式 ${method}：${name}`);
        }
        files.push({ name, data });
    }
    return files;
}
function decodeName(raw) {
    // 通用标志位 0x0800 声明名字是 UTF-8；不带它时规范说是 CP437，但现代工具一律写
    // UTF-8，所以直接按 UTF-8 解码，并顺手把反斜杠归一成正斜杠。
    return raw.toString('utf8').replace(/\\/g, '/');
}
function assertSafeZipPath(name) {
    if (name.startsWith('/') || /^[A-Za-z]:/.test(name))
        throw new Error(`压缩包里有绝对路径：${name}`);
    const segments = name.split('/');
    for (const segment of segments) {
        if (segment === '..')
            throw new Error(`压缩包里有上跳路径：${name}`);
    }
    if (name.includes('\u0000'))
        throw new Error('压缩包里有非法路径');
}
function findEndOfCentralDirectory(buffer) {
    const minimum = 22;
    if (buffer.length < minimum)
        return -1;
    const start = Math.max(0, buffer.length - minimum - 0xffff);
    for (let cursor = buffer.length - minimum; cursor >= start; cursor -= 1) {
        if (buffer.readUInt32LE(cursor) === EOCD_SIGNATURE)
            return cursor;
    }
    return -1;
}
/**
 * 写出一个 zip。输出是确定性的（固定时间戳、条目按给定顺序），所以测试可以直接比字节。
 */
export function writeZip(files, options = {}) {
    const compress = options.compress !== false;
    const locals = [];
    const centrals = [];
    let offset = 0;
    for (const file of files) {
        const nameBytes = Buffer.from(file.name, 'utf8');
        const checksum = crc32(file.data);
        const deflated = compress ? deflateRawSync(file.data) : null;
        const useDeflate = deflated !== null && deflated.length < file.data.length;
        const payload = useDeflate ? deflated : file.data;
        const method = useDeflate ? 8 : 0;
        const local = Buffer.alloc(30);
        local.writeUInt32LE(LOCAL_SIGNATURE, 0);
        local.writeUInt16LE(20, 4);
        local.writeUInt16LE(0x0800, 6);
        local.writeUInt16LE(method, 8);
        local.writeUInt16LE(0, 10);
        local.writeUInt16LE(0x5a21, 12);
        local.writeUInt32LE(checksum, 14);
        local.writeUInt32LE(payload.length, 18);
        local.writeUInt32LE(file.data.length, 22);
        local.writeUInt16LE(nameBytes.length, 26);
        local.writeUInt16LE(0, 28);
        locals.push(local, nameBytes, payload);
        const central = Buffer.alloc(46);
        central.writeUInt32LE(CENTRAL_SIGNATURE, 0);
        central.writeUInt16LE(20, 4);
        central.writeUInt16LE(20, 6);
        central.writeUInt16LE(0x0800, 8);
        central.writeUInt16LE(method, 10);
        central.writeUInt16LE(0, 12);
        central.writeUInt16LE(0x5a21, 14);
        central.writeUInt32LE(checksum, 16);
        central.writeUInt32LE(payload.length, 20);
        central.writeUInt32LE(file.data.length, 24);
        central.writeUInt16LE(nameBytes.length, 28);
        central.writeUInt16LE(0, 30);
        central.writeUInt16LE(0, 32);
        central.writeUInt16LE(0, 34);
        central.writeUInt16LE(0, 36);
        central.writeUInt32LE(0, 38);
        central.writeUInt32LE(offset, 42);
        centrals.push(central, nameBytes);
        offset += local.length + nameBytes.length + payload.length;
    }
    const centralBuffer = Buffer.concat(centrals);
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(EOCD_SIGNATURE, 0);
    eocd.writeUInt16LE(0, 4);
    eocd.writeUInt16LE(0, 6);
    eocd.writeUInt16LE(files.length, 8);
    eocd.writeUInt16LE(files.length, 10);
    eocd.writeUInt32LE(centralBuffer.length, 12);
    eocd.writeUInt32LE(offset, 16);
    eocd.writeUInt16LE(0, 20);
    return Buffer.concat([...locals, centralBuffer, eocd]);
}
