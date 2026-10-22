# LUMIX Lab APK 架构逆向分析（参考文档）

对 Panasonic LUMIX Lab 3.1.0（Android）的静态逆向分析结果，用于评估并指导同功能 App 的 HarmonyOS（ArkTS / ArkUI / NAPI）重写。

- 目标：`com.panasonic.jp.lumixlab` versionName `3.1.0` / versionCode `22`
- APK SHA-256：`262335c3032c82fc966812e84803551cffd215d5125fc334fffa221e5be91824`
- 方法：APK 打包事实（ZIP / `aapt2` / `apksigner`）+ JADX 1.5.1 反编译（8,557 类）+ 原生库 JNI 符号 + `.ort` 模型结构扫描
- 边界：**未执行 APK**，运行期行为未验证；混淆严重（仅 `com.panasonic.jp.lumixlab.*` 保留类名）

## 文件

| 文件 | 说明 |
|---|---|
| [`lumix-lab-architecture-analysis.md`](./lumix-lab-architecture-analysis.md) | 主文档，14 章（约 1,170 行）：打包事实、技术栈、连接协议全表、遥控与 liveview、图库传输、直播、RAW/视频管线、LUT 与 AI、数据库、复杂点总结、鸿蒙移植方案、附录 |
| [`lumixlab-reference.json`](./lumixlab-reference.json) | 机器可读参考：48 条 BLE UUID↔语义、REST 端点表、46 个遥控命令、28 个能力键、liveview 头部字段表、12 张数据库表 |

## 主要结论

1. 产品是"相机协议客户端 + RAW/视频工作站 + 端侧 AI"三合一；相机数据面是自研 **HTTPS REST**（BaseUrl `https://192.168.54.1/`），不是 PTP/IP，PTP 仅用于 USB。
2. BLE 承载配对、Wi-Fi 凭据、相机证书指纹、机身状态、自动传输、快门与直播指令；安全模型为 TOFU + 证书指纹固定。
3. liveview 是自定义二进制协议（约 120 字节定长头 + 5 组变长数组），存在两代解析器。
4. RAW 显影是一次 45 参数 JNI 调用，内核以 Vulkan compute（36 个 SPIR-V）实现，是最难移植的部分。
5. PhotoStyle 色彩来自 `PSL1` 二进制（88 字节头 + half 数据，`_low/_high` 为 33³ 网格），格式已逐字节验证。
6. Magic LUT：输入 `image [1,3,224,224]`（CHW、/255）→ 输出 `[1,3,33,33,33]` → 写 33³ `.cube` → 与风格→V-Log cube 合并。
7. 视频导出不经过 FFmpeg：预览为 `MediaCodec + libyuv + libtechorfilter`，导出为 8 节点 `MediaCodec(Surface) + MediaMuxer` 图；FFmpeg 仅用于取帧/元数据。

## 重新生成

```powershell
# 打包事实
aapt2 dump badging  "Panasonic LUMIX Lab_3.1.0.apk"
aapt2 dump xmltree --file AndroidManifest.xml "Panasonic LUMIX Lab_3.1.0.apk" > manifest.txt
aapt2 dump resources "Panasonic LUMIX Lab_3.1.0.apk" > resources.txt
apksigner verify --print-certs "Panasonic LUMIX Lab_3.1.0.apk"

# 反编译（先普通，再对失败方法补 --show-bad-code）
jadx -d _decompiled  --no-res -j 16 "Panasonic LUMIX Lab_3.1.0.apk"
jadx -d _decompiled2 --no-res --show-bad-code -j 16 "Panasonic LUMIX Lab_3.1.0.apk"
```

## 使用建议

先读主文档开头的「结论摘要（先看这 12 条）」与第 13.4 节的三个选型决策（RAW 显影方案、ViT 模型落地、直播架构），再按第 13.3 节的分阶段计划（P0 连接 → P1 遥控 → P2 图库/传输 → P3 LUT → P4 图像 → P5 视频 → P6 AI）推进。协议实现时可直接对照 `lumixlab-reference.json`。
