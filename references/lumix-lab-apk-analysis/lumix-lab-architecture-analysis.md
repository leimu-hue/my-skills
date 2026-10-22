# Panasonic LUMIX Lab 3.1.0 —— APK 架构与关键实现分析

> 目标读者：准备用 HarmonyOS（ArkTS / ArkUI / NAPI）重写同类相机伴侣 App 的工程团队。
> 分析对象：`Panasonic LUMIX Lab_3.1.0.apk`（SHA-256 `262335c3032c82fc966812e84803551cffd215d5125fc334fffa221e5be91824`）。
> 分析方法与证据边界见第 0 节；文中每条结论尽量给出 `文件:行号` 或资源名，便于复核。

---

## 结论摘要（先看这 12 条）

1. **这不是一个"遥控器 App"，而是三合一产品**：相机协议客户端（BLE + HTTPS REST + USB PTP）、移动端 RAW/视频工作站（Vulkan compute 显影 + MediaCodec 节点图）、端侧 AI（ViT 生成 3D LUT）。（§1.2、§3、§8、§9、§10）
2. **相机数据面是自研 HTTPS REST，不是 PTP/IP**：BaseUrl 固定 `https://192.168.54.1/`，35+ 端点，Bearer Token 由 `POST /auth` 换取；PTP 只用于 USB 有线通道。（§3.3、§3.4）
3. **安全模型是 TOFU + 证书指纹固定**：Wi-Fi 凭据与证书指纹都从 BLE 取，运行时用 SHA-256 指纹校验相机证书。移植时必须保留等价机制（建议改为"以 BLE 下发的 CA 作为唯一信任锚"）。（§3.1）
4. **BLE 有 48 个已命名的 GATT 特征**，覆盖凭据、机身信息、GPS/时间同步、自动传输、快门、直播指令。这是鸿蒙端最容易 1:1 复刻的部分。（§3.2）
5. **实时取景是自定义二进制协议**：约 120 字节定长头（含 `totalsize/seqno/pts/exheadersize` 等）+ 5 组变长数组（对焦框、图标、设置、PhotoStyle 明细），并存两代解析器。（§4.2）
6. **RAW 显影是一次 45 参数的 JNI 调用**，内核在 `libtechorfilter.so` 里用 **Vulkan compute**（36 个 SPIR-V）实现——这是最不可替代、也最难移植的部分。（§8.2、§8.7）
7. **PhotoStyle 的官方色彩来自 `PSL1` 二进制**：88 字节头（magic/kind/size/encoding/64 字节名称/14 保留）+ half 数据；`_low/_high` 为 33³ 网格。格式已逐字节验证，可原样复用。（§8.5）
8. **Magic LUT 的 IO 已完全还原**：输入 `image` = `[1,3,224,224]`（CHW、/255），输出 `[1,3,33,33,33]`，直接写成 33³ `.cube`，再与"风格→V-Log"的 13 个 cube 之一合并（`mergeCubeFiles`）。（§10.5）
9. **视频导出不经过 FFmpeg**：预览是 `MediaExtractor+MediaCodec+libyuv+techOR`，导出是 8 节点 `MediaCodec(Surface)+MediaMuxer` 图；FFmpeg 只被 `FFmpegMediaMetadataRetriever` 用来取帧/元数据。（§9.1、§9.4、§9.7）
10. **变速曲线数学可直接复刻**：`y→0.2×…10×` 三段映射 + Catmull-Rom + `out += Δ/speed` 积分 + 24/30fps CFR 重采样。（§9.5）
11. **持久化是 Room v9、11 张表、8 次迁移、无索引无外键**；编辑参数是 88 列宽表；键值层用的是 DataStore（不是 SharedPreferences）。（§11）
12. **最大技术债是 `LlcApplication` 上帝对象（约 120 个可变字段）+ 40 多个广播 + 60 余处全局锁**；鸿蒙端应重写为"仓储 + 显式状态机 + 长时任务"。（§2.3、§12、§13.6）

**移植优先级建议**：P0 连接（BLE+Wi-Fi+REST）→ P1 遥控（liveview）→ P2 图库/传输 → P3 LUT（含下发）→ P4 图像编辑（RAW 选型先行）→ P5 视频 → P6 AI。三条必须先拍板的决策见 §13.4。

**配套文件**：同目录 `lumixlab-reference.json`（BLE UUID 表、REST 端点表、命令词汇表、数据库表清单，机器可读）。

## 目录

- [0. 分析方法、证据强度与边界](#0-分析方法证据强度与边界)
- [1. 应用概览](#1-应用概览)｜[1.1 打包事实](#11-打包与构建事实)｜[1.2 体积构成](#12-体积构成决定移植优先级)｜[1.3 功能地图](#13-功能地图从清单fragment资源名反推)｜[1.4 声明组件](#14-声明组件manifest-关键项)
- [2. 工程与运行架构](#2-工程与运行架构)｜[2.1 代码组织](#21-代码组织)｜[2.2 技术栈](#22-技术栈观测)｜[2.3 运行架构与数据流](#23-运行架构与数据流)
- [3. 相机连接子系统](#3-相机连接子系统最复杂的部分之一)｜[3.1 连接时序](#31-连接建立时序wi-fi-主路径)｜[3.2 BLE GATT 全表](#32-ble-gatt-特征全表h5ajava-完整转录)｜[3.3 REST 全表](#33-相机-rest-api-全表h6interfacec2329ajava-逐条转录)｜[3.4 USB PTP](#34-usb-ptp-通道)
- [4. 遥控拍摄](#4-遥控拍摄)｜[4.1 能力集](#41-能力集协商remotegt-setting)｜[4.2 liveview 协议](#42-实时取景liveview二进制协议)｜[4.3 命令词汇表](#43-命令词汇表companasonicjplumixlabutilljava)｜[4.4 遥控 UI](#44-遥控-ui-的复杂度)
- [5. 图库与传输](#5-图库与传输)
- [6. 直播](#6-直播live-delivery)
- [7. 云服务、固件与分析](#7-云服务固件与分析)
- [8. 静止图像显影/编辑管线](#8-静止图像显影--编辑管线)｜[8.2 ImageFilter](#82-comtechocteorfilterimagefilter-原生接口libtechorifierso)｜[8.4 参数模型](#84-编辑参数模型beanrawprocessingconfigbean1027-行)｜[8.5 PSL1](#85-photostyle-lutpsl1格式已逐字节验证)｜[8.6 导出](#86-导出与元数据)｜[8.7 GPU/CPU](#87-gpu--cpu-分工重要)
- [9. 视频编辑/转码管线](#9-视频编辑--转码管线)｜[9.2 预览栈](#92-预览栈yuvvideopackage类职责)｜[9.4 导出节点图](#94-导出节点图)｜[9.5 变速数学](#95-变速曲线数据模型与数学可-11-复刻)
- [10. LUT 体系与端侧 AI](#10-lut-体系与端侧-aiagic-magic-lut)｜[10.3 相机 LUT 下发](#103-相机侧-lut-模型与下发协议)｜[10.5 Magic LUT](#105-magic-lut端侧-vit-推理完整链路)｜[10.6 模型本体](#106-模型文件本体观测)
- [11. 数据持久化](#11-数据持久化)｜[11.1 Room](#111-room-数据库v98-次迁移)｜[11.2 edit_info](#112-edit_info-的-89-列分组对应-84-的参数模型)｜[11.3 DataStore](#113-键值存储androidx-datastore-preferences不是-sharedpreferences)
- [12. 十个复杂点总结](#12-十个复杂点总结复刻时最容易踩坑的地方)
- [13. HarmonyOS 移植方案](#13-harmonyosnext移植方案)｜[13.1 能力映射](#131-能力映射表)｜[13.2 工程结构](#132-推荐工程结构)｜[13.3 分阶段](#133-分阶段落地)｜[13.4 决策点](#134-三个必须先决策的选型)｜[13.5 可复用资产](#135-可直接复用的资产)｜[13.6 不照搬](#136-不建议照搬)
- [14. 附录](#14-附录)｜[14.1 类速查](#141-关键类速查)｜[14.2 资源清单](#142-资源清单)｜[14.3 待验证问题](#143-待真机验证的问题)｜[14.4 复现命令](#144-复现命令)

---

## 0. 分析方法、证据强度与边界

| 证据类型 | 取得方式 | 可信度 | 说明 |
|---|---|---|---|
| 打包事实 | ZIP 目录、`aapt2 dump badging/xmltree/resources`、`apksigner` | 观测（高） | 清单、权限、资源表、体积构成 |
| 代码事实 | JADX 1.5.1 反编译 2 个 DEX（8,557 个类，13,495 个 `.java`） | 观测（高，但为反编译产物） | 少量方法 JADX 无法还原（"Method dump skipped"），已用 `--show-bad-code` 二次反编译补齐 |
| 原生库 | 提取 `lib/arm64-v8a/*.so` 后扫描 JNI 符号 / 导出名 | 观测（中高） | 仅符号与字符串层面，未做指令级逆向（本机无 Ghidra/IDA 可用） |
| 模型文件 | 对 `assets/models/*.ort` 做 flatbuffer 字符串/节点名扫描 | 观测（中） | 得到计算图命名空间与算子集，未解析张量形状 |
| 协议行为 | Retrofit 接口注解 + 请求/响应 Bean + BLE 特征表 | 观测（高） | 注解与 UUID 被保留，是本报告最可靠的部分 |
| 运行期行为 | **未执行 APK** | — | 本报告不做"运行时已验证"的断言；凡属推断均标注"推断" |

已知限制：

- 代码被 R8 混淆：**只有 `com.panasonic.jp.lumixlab.*` 的类名被保留**，其余（含大量业务实现）被打包进 `A`…`z9` 这类双字符包，类名退化为 `a`、`A0`、`AbstractC1967C`。因此"某功能在哪个类"常常只能靠调用关系与字符串定位。
- 资源被混淆：`res/` 下 9,080 个文件被扁平化重命名（`res/-u.xml`、`res/--L.png`），布局名只存在于 `resources.arsc` 中（可用 `aapt2 dump resources` 还原映射）。
- 反编译存在 25 个类失败；如 `H5.d#onCharacteristicChanged`、`LlcApplication#lambda$checkAndUpdateLutData$6` 等，已针对性补反编译，但仍有个别方法以 `UnsupportedOperationException` 占位。

---

## 1. 应用概览

### 1.1 打包与构建事实

| 项 | 值 | 来源 |
|---|---|---|
| 包名 | `com.panasonic.jp.lumixlab` | `aapt2 dump badging` |
| versionName / versionCode | `3.1.0` / `22` | 同上 |
| minSdk / targetSdk / compileSdk | 30 / 35 / 35（Android 15） | 同上 |
| 签名 | 单签名，`C=JP, O=Panasonic Entertainment & Communication Company Limited`，证书 SHA-256 `54eafb85…828480d` | `apksigner verify --print-certs` |
| ABI | `arm64-v8a`、`armeabi-v7a`、`x86`、`x86_64`（4 套原生库） | ZIP 目录 |
| DEX | `classes.dex` 7.00 MB + `classes2.dex` 4.81 MB（共 ~11.8 MB，8,557 类） | ZIP + JADX 进度 |
| 条目数 | 9,992 个条目；解压 426.6 MB / 压缩 374.8 MB | ZIP 中央目录 |
| 语言 | 资源含 80+ 语言（`application-label-xx`），代码内嵌日文注释与日文错误码表 | `aapt2`、`K5/C0638l0.java` |

### 1.2 体积构成（决定移植优先级）

| 分区 | 文件数 | 体积 | 内容 |
|---|---|---|---|
| `assets/` | 585 | **208.7 MB** | AI 模型 56.8 MB、PhotoStyle LUT 59.0 MB、引导视频 76.3 MB、Vulkan SPIR-V 37 个、`.cube` LUT、协议说明/JSON 表 |
| `lib/` | 70 | **151.4 MB** | ONNX Runtime 17.4 MB、FFmpeg(avcodec/avformat/swscale/avutil) 9.2 MB、techOR 滤镜 6.1 MB、BoringSSL、libheif/de265、libyuv、`libllc.so`、`libcube_merge.so` |
| `res/` | 9,080 | 50.7 MB | 混淆后的图片/布局/颜色 |
| 根目录 | 26 | 15.3 MB | 2 个 DEX、`resources.arsc` 3.48 MB、Firebase/Play 配置 |

原生库清单（`lib/arm64-v8a`，按大小）：

| 库 | 体积 | 作用（观测/推断） |
|---|---|---|
| `libonnxruntime.so` | 17.37 MB | ONNX Runtime 推理引擎（Magic LUT 模型） |
| `libavcodec.so` | 7.04 MB | FFmpeg 编解码 |
| `libtechorfilter.so` | 6.05 MB | 合作方 "techOR" 图像滤镜引擎：RAW 解码/LUT/降噪/锐化，内部含 Vulkan Memory Allocator、`IslZ*` 命名空间 |
| `libcrypto.so` / `libssl.so` | 2.55 / 0.56 MB | BoringSSL（相机 HTTPS + 云 API） |
| `libavformat.so` | 1.39 MB | FFmpeg 封装/解封装 |
| `libc++_shared.so` | 1.31 MB | C++ 运行时 |
| `libde265.so` / `libheif.so` | 1.27 / 0.95 MB | HEIC/HEIF 解码 |
| `libyuv_android.so` / `libyuv.so` | 0.86 / 0.39 MB | YUV↔RGB 转换 |
| `libavutil.so` / `libswscale.so` | 0.47 / 0.33 MB | FFmpeg 工具/缩放 |
| `libllc.so` | 0.10 MB | **自有 JNI 核心**：RW2/HEIF/MP4 解析、LUT、色彩转换（见第 8 节） |
| `libonnxruntime4j_jni.so` | 0.07 MB | ORT Java 绑定 |
| `libffmpeg_mediametadataretriever_jni.so` | 0.06 MB | 用 FFmpeg 替代 `MediaMetadataRetriever` |
| `libcube_merge.so` | 0.01 MB | `.cube` 合并 |
| `libyuv-decoder.so` | 0.01 MB | GPUImage 的 YUV 解码（`jp.co.cyberagent.android.gpuimage`） |

> 结论：这是一个 **"相机协议客户端 + 移动端 RAW/视频工作站 + 端侧 AI 推理"** 三合一的 App。UI 层（View 体系）只占代码量的一小部分，真正的复杂度在协议、图像管线与本地数据模型。

### 1.3 功能地图（从清单、Fragment、资源名反推）

```
LUMIX Lab
├─ 相机连接（CameraFragment 家族）
│   ├─ BLE 扫描/配对（CameraBluetooth*Fragment）
│   ├─ Wi-Fi 直连（CameraWifiConnectFragment）
│   └─ USB 连接（CameraUsbConnection*Fragment / UsbAttachActivity）
├─ 遥控拍摄（RemoteShootingActivity / RemotePhotostyleActivity / ShutterRemoteControlFragment）
│   ├─ 实时取景（liveview 二进制流 + 相机状态叠加）
│   ├─ 拍摄参数（曝光/快门/ISO/WB/PhotoStyle/RealTimeLUT…）
│   └─ 快门/录像/触摸 AF
├─ 图库与传输（CameraGalleryActivity / GalleryContainerFragment / BurstActivity）
│   ├─ 相机内媒体浏览（分页、缩略图、评分过滤）
│   ├─ 手动/自动传输（含 RAW、连拍、SD 卡切换）
│   └─ 传输完成后通知相机（media/transfer/notify）
├─ LUT 工作台（LutFragment、Community*、Template*）
│   ├─ PhotoStyle LUT（相机机型专属 PSL1 资源）
│   ├─ .cube 导入/合并/命名/排序/删除
│   ├─ Magic LUT（端侧 ViT 模型生成 LUT）
│   ├─ 社区 LUT 下载（lutapi/v2）
│   └─ LUT 下发到相机（lut/send 分块上传）
├─ 图像编辑（EditActivity → EditTabView + sheet/*）
│   ├─ RAW 显影（曝光/对比/高光/阴影/HSL/分离色调/效果…）
│   ├─ 裁剪/旋转/相框模板
│   └─ 导出 JPEG / HEIF（含 10bit HDR→P010 路径）
├─ 视频编辑（edit/sheet/video/*，速度曲线、裁剪）
├─ 直播（LiveDelivery*：RTMP/RTMPS 直推 + YouTube 直播间创建）
├─ 设置/账号（SettingActivity、隐私/许可、UserSegments）
└─ 其它：固件更新（FirmwareUpdate*）、Tips、Push 通知、深链（DeepLinkRouterActivity）
```

### 1.4 声明组件（Manifest 关键项）

| 组件 | 类 | 说明 |
|---|---|---|
| Application | `LlcApplication` | 全局单例 + 生命周期回调 + 原生库加载 |
| Activity（导出） | `AppLaunchScreenActivity`、`MainActivity`、`DeepLinkRouterActivity`、`UsbAttachActivity` | 启动、主页、深链路由、USB 插入 |
| Service | `LlcService`、`ForegroundService`、`LocationForegroundService`、`LlcMessagingService`、`BleLogService` | 前台保活（USB/自动传输/发图/GPS）、FCM |
| Receiver | `LLCBleCentral$BtBroadcastReceiver` | 蓝牙状态广播 |
| Provider | `FileProvider`（`…fileProvider`）、`FirebaseInitProvider`、`androidx.startup` | 分享、FCM 初始化 |
| 权限（要点） | `NEARBY_WIFI_DEVICES`、`BLUETOOTH_SCAN/ADVERTISE/CONNECT`、`ACCESS_BACKGROUND_LOCATION`、`FOREGROUND_SERVICE_{LOCATION,CONNECTED_DEVICE}`、`READ_MEDIA_IMAGES/VIDEO`、`USB_PERMISSION`、`SYSTEM_ALERT_WINDOW` | 连接与后台传输是权限重灾区 |

---

## 2. 工程与运行架构

### 2.1 代码组织

| 包 | 类数（.java） | 内容 |
|---|---|---|
| `com.panasonic.jp.lumixlab.bean` | 94 | 全部 DTO：相机 REST 请求/响应、编辑参数、社区、固件 |
| `com.panasonic.jp.lumixlab.util` | 155 | 工具与**业务中枢**：`C1559v`（3,000+ 行通用工具）、`S`（DataStore Preferences 封装）、`C1517b0`（LUT/导出）、`p1`（原 `RawEditManager`）、`C1566x`（Magic LUT 前后处理）、`videoEdit/YUVVideoPackage` |
| `com.panasonic.jp.lumixlab.widget` | 168 | 自定义 View（曲线、色轮、裁剪框、进度条…） |
| `com.panasonic.jp.lumixlab.controller` | 90 | 36 个 Activity + 23 个 Fragment |
| `com.panasonic.jp.lumixlab.database` | 14 | Room：1 个 Database + 13 个 Entity |
| `com.panasonic.jp.lumixlab.service` | 4 | 前台服务与 FCM |
| `com.panasonic.jp.lumixlab.model` | 2 | 仅剩 BLE 日志服务与广播接收器（其余被混淆进 `H5`) |
| 其它（混淆） | ~12,000 | `K5`（PTP/相机模型/协议常量）、`p6`（PTP 传输）、`q6`（PTP 结果码）、`Y5`（PTP 命令构造）、`H5`（BLE 中心）、`Z5`（业务状态机）、`F5`（页面逻辑）、`E5`（社区 UI）、`h6`（相机 REST 客户端）、`d5`/`D5`（ViewBinding 生成类）… |

> 之所以 `com.panasonic` 只有约 529 个 `.java`，是因为 **R8 的包重命名把绝大多数实现类（包括相机协议栈、编辑管线、AI 推理封装）搬到了双字母包**，而这些恰好是最有价值的部分。

### 2.2 技术栈（观测）

| 领域 | 选型 | 证据 |
|---|---|---|
| UI | Android View 体系（无 Compose）+ ViewBinding + Navigation(`R.id.navigation_*`) | DEX 中 `androidx/compose` 计数为 0；`d5.L1` 等 ViewBinding 类；`MainActivity` 的 `navigation_camera/gallery/lut` |
| 异步 | RxJava + AutoDispose + LiveData/ViewModel + 自建线程池 | `autodispose2`、`W1.d(W1.g.a(...))`、`LlcApplication.executor = newFixedThreadPool(100)` |
| 网络（云） | Retrofit + OkHttp + Gson | `h6.InterfaceC2329a` 的 `@o("community/lut")` 等注解；`oa.*` 为 OkHttp |
| 网络（相机） | 同一套 Retrofit 客户端，BaseUrl 硬编码 `https://192.168.54.1/` | `h6/C2330b.java:4` |
| 本地库 | Room | `database/AppDatabase.java`、`AppDatabase_Impl.java` |
| 图片加载 | Glide（+ 自定义 `GlideModule`） | `com.bumptech.glide`、`LlcApplication` 中 `DiskCache` 初始化 |
| 视频播放 | ExoPlayer / media3 + RTMP 扩展 | `androidx/media3`、`D0/o.java` 反射加载 `RtmpDataSource` |
| 视频处理 | MediaCodec 预览/导出 + 自研 YUV 与变速节点图；FFmpeg **仅用于取帧/元数据** | `libav*` 仅被 `FFmpegMediaMetadataRetriever` 加载、`util/videoEdit/YUVVideoPackage`、`e6/j6` 节点图（见第 9 节） |
| 图像处理 | techOR 引擎（Vulkan compute）+ GPUImage(GLES 预览链) + 自研 JNI(`libllc`) | 见第 8 节 |
| AI | ONNX Runtime（ViT 模型） | `ai.onnxruntime`、`assets/models/PI_3D_LUT_v1.0.0_model_B_fp16.ort` |
| 元数据 | `com.drew`(metadata-extractor) + Adobe XMP(`com.adobe.xmp`) | 全量 EXIF/XMP 读写 |
| 分析/推送 | Adobe Experience Platform（Analytics/Campaign/Identity/Signal/Lifecycle/UserProfile）+ Firebase Messaging | `LlcApplication.onCreate()` 中注册 6 个 Extension；`appId=9a3bddd6f912/decd7ac6e1fc/launch-56ec323a4397` |
| 登录 | Google Sign-In + YouTube Data API v3（scope `youtube`） | `util/D1.java` |
| 安全 | BoringSSL、证书指纹固定（TOFU）、`FileProvider` | `h6/d.java`、`f.java`、`g.java` |

### 2.3 运行架构与数据流

```
                       ┌──────────────────────────── LlcApplication (单例上帝对象) ───────────────────────────┐
                       │ 全局状态：authToken / 连接的相机列表 / 传输队列 / LUT 临时对象 / EXIF 字段 / 各类开关     │
                       │ 基础设施：Room / Glide / Adobe AEP / Firestore? / HandlerThread("...async") / 100 线程池 │
                       └───────────────┬───────────────────────────────┬──────────────────────────────┬──────────┘
                                       │                               │                              │
             ┌─────────────────────────▼──────────┐    ┌───────────────▼────────────┐   ┌─────────────▼─────────────┐
             │ 连接层 Transport                     │    │ 协议层 Protocol             │   │ 业务层 Feature            │
             │ ─ BLE: H5.j (LLCBleCentral)         │    │ ─ REST: h6.InterfaceC2329a  │   │ ─ RemoteShootingActivity  │
             │ ─ Wi-Fi: I5.c (NetworkSpecifier)    │    │   (Retrofit, HTTPS 192.168…)│   │ ─ CameraGalleryActivity   │
             │ ─ USB: p6.C3096m (PTP over USB)     │    │ ─ PTP:  p6.C3089f/C3090g    │   │ ─ LutFragment / EditActivity│
             └─────────────────────────┬──────────┘    └───────────────┬────────────┘   └─────────────┬─────────────┘
                                       │                               │                              │
             ┌─────────────────────────▼───────────────────────────────▼──────────────────────────────▼─────────────┐
             │ 平台服务层：LlcService(binder) / ForegroundService / LocationForegroundService / Room / WorkManager?   │
             └───────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

关键观察（对移植最有价值）：

1. **没有一个统一的"相机会话"对象**。相机对象是 `K5.C0643o`（含 SSID、密码、连接状态、BLE 状态等字段），存放在 `C3905k2`（CameraViewModel）里，再由 `LlcApplication` 通过 `getContext()` 到处取用。移植时应显式建一个 `CameraSession` 仓储。
2. **UI→协议**通过 ViewModel(`z5.C3905k2`) + 广播(`BROADCAST_ACTION_*`) 双向驱动，广播名超过 40 个（`BROADCAST_ACTION_PTP_PAIRING_COMPLETED`、`…AUTO_TRANSFER_OPERATE_WIFI_CONNECTION`…）。移植时建议改为显式状态机 + 事件总线。
3. **同步阻塞普遍存在**：`PtpSender.c(cmd)` 直接返回结果、`AppDatabase.w(ctx).t().f(list)` 在主线程路径被调用等；鸿蒙侧必须改为 async/await + TaskPool。


---

## 3. 相机连接子系统（最复杂的部分之一）

LUMIX Lab 同时支持 **三条完全不同的相机通道**，且它们解决的问题不同：

| 通道 | 角色 | 传输 | 认证 | 代码位置 |
|---|---|---|---|---|
| BLE（GATT） | 发现/配对、交换 Wi-Fi 凭据、机身状态订阅、低带宽控制（快门、GPS、时间、自动传输开关、直播指令） | GATT 读写/通知 | 无需 TLS；靠配对与 UUID | `H5.j`（中心）、`H5.d`（GATT 回调）、`H5.a`（UUID↔语义表）、`H5.z`（业务状态机） |
| Wi-Fi（HTTPS REST） | 主数据面：图库、原图下载、遥控设置、LUT/固件下发、直播推流控制 | HTTPS，BaseUrl `https://192.168.54.1/` | 证书指纹固定 + `POST /auth` 换 Bearer Token | `h6.*`（Retrofit）、`I5.c`（联网）、`Z5.*`（会话状态机） |
| USB（PTP） | 有线连接：机身控制、对象传输、部分机型固件/配对 | USB bulk PTP 容器 | PTP 会话 | `p6.C3096m`（UsbControl）、`p6.C3089f`（NotifyCenter）、`p6.C3090g`（Sender）、`Y5.*`（命令构造） |

> 关键判断：**Wi-Fi 走的是相机自研的 HTTPS+JSON REST，而不是行业常见的 PTP/IP**。PTP 只出现在 USB 通道。这一点直接决定了鸿蒙端的工作量——不需要实现 PTP/IP 栈，但需要实现 BLE GATT 客户端 + Wi-Fi 定向连接 + 自签证书固定 + REST 客户端。

### 3.1 连接建立时序（Wi-Fi 主路径）

```
① BLE 扫描（过滤 advertised service 054ac620-3214-11e6-ac0d-0002a5d5c51b）
        ↓ 连接 → discoverServices() → 定位 service 1fe71b85-8344-4e6a-bf1a-ac7acdb3f8af
② 写 APP_INFO / APP_UUID / FRIENDLY_NAME（应用标识 + 设备名 Build.MODEL）
        ↓ 读 INITIAL_INFORM / CAMERA_MODEL_NAME / CAMERA_FM_VERSION / LENS_* / SD_CARD_SLOTS_INFO
③ 读 WIFI_SSID + WIFI_PASSWORD（相机热点凭据）
        ↓ 读 HTTPS_CA_CONTENTS + CER_FINGER_PRINT（相机自签证书与 SHA-256 指纹）
④ 手机侧用 WifiNetworkSpecifier(WPA2/WPA3) requestNetwork + bindProcessToNetwork 加入相机热点
        ↓ 建立 HTTPS 到 192.168.54.1，用 CER_FINGER_PRINT 做证书固定（TOFU）
⑤ POST /auth  {AppInfo:"LUMIX LUT Creators APP <ver>", Uuid:<持久 UUID>, FriendlyName:<Build.MODEL>}
        ↓ 得到 Data.AuthToken，此后所有请求头 Authorization: Bearer <token>
⑥ 进入业务：remote/get-setting 拉取能力集 → remote/start-stream 开始实时取景
```

对应证据：
- 扫描过滤：`H5/j.java:478`（`ScanFilter.Builder.setServiceUuid("054ac620-…")`），`ScanSettings` 为 `SCAN_MODE_LOW_LATENCY` + `MATCH_MODE_AGGRESSIVE`（`H5/j.java:477`）。
- 服务定位：`H5/d.java:513`（寻找 `1fe71b85-8344-4e6a-bf1a-ac7acdb3f8af`），随后对每个 characteristic 调 `setCharacteristicNotification(…, true)`（`H5/d.java:565` 附近）。
- 写队列：`H5/j.java:288`（`b()` 逐条 `writeCharacteristic`，读操作串行化并在 100 ms 后重试）。
- Wi-Fi：`I5/c.java:81`（`new WifiNetworkSpecifier.Builder().setSsid().setWpa2Passphrase().build()`）、`I5/c.java:85`（WPA3）、`I5/c.java:94`（`requestNetwork`）、`I5/c.java:130`（`WifiNetworkSuggestion`，`setPriority(100)`）、`Z5/C3984s2.java:37`（`bindProcessToNetwork`）。
- 证书固定：`h6/g.java`（信任所有证书的 `X509TrustManager`）+ `h6/d.java:34`（用 `SSLSession` 叶证书 SHA-256 与 `LlcApplication.getCerFingerPrint()` 比对，即**只认配对时 BLE 下发的证书指纹**）。
- 认证：`Z5/C3905k2.java:259`、`F5/AbstractActivityC1967C.java:450`；Token 存于 `LlcApplication.authToken`（`LlcApplication.java:1401`）。

### 3.2 BLE GATT 特征全表（`H5/a.java` 完整转录）

扫描服务：`054ac620-3214-11e6-ac0d-0002a5d5c51b`
数据服务：`1fe71b85-8344-4e6a-bf1a-ac7acdb3f8af`

| UUID | 语义名 | 方向（观测/推断） |
|---|---|---|
| `239c7203-922f-43e9-bdf1-6d1fedf6f43f` | INITIAL_INFORM | 读 |
| `ed8b1352-5aa7-4155-b7c9-521292dd1932` | APP_INFO | 写/读 |
| `05a797b6-9c2f-4d18-99a7-fa61a3880bfe` | FRIENDLY_NAME | 读写 |
| `bff12e7f-5944-4eb6-a90f-48d8786157ea` | APP_UUID | 写/读 |
| `657edba2-5bc8-42dd-974f-21871d7dbcd1` | WIFI_SSID | 读 |
| `42d509f7-f122-4816-92d1-5e402d9453cb` | WIFI_PASSWORD | 读 |
| `dcba3a74-80bc-4919-8ef4-0c9f99cc20dd` | AP_STATE | 通知（1 字节） |
| `7644371c-1ddc-4b16-832f-f07c322e311b` | ACTION_MODE | 写 |
| `6c875728-7636-425e-818a-f1d93a39e075` | ACTION_MODE_RESULT | 通知（1 字节） |
| `09b2bddf-452b-48e8-96de-92954f48c21b` | AUTO_TRANSFER_START_CMD | 写（1 字节） |
| `52f8c131-dd62-4e34-9283-3086db261fad` | AUTO_TRANSFER_START_NOTIFY | 通知（1 字节） |
| `30185b4a-f18f-44c1-9b19-1bf787956185` | AUTO_TRANSFER_OBJ | 读 |
| `79780bf7-897e-4a4f-a4f2-ae51fa3fa51b` | AUTO_TRANSFER_GET_SETTING | 读 |
| `d6bbd828-eb91-4b00-acfc-b2c5821ff0f7` | SD_CARD_SLOTS_INFO | 读 |
| `ca1b02cb-0cdd-42fb-aba4-a4212e019ffb` | SD_CARD_REMOVED_NOTIFY | 通知 |
| `e08508ea-b4f8-4a22-8025-b1f22748e8e4` | CAMERA_DESTINATION | 读 |
| `b2c2c10e-2702-4f75-9c0e-d676dd249b20` | CAMERA_DESTINATION_SUB | 读 |
| `943cc5aa-4abd-4b59-98f3-ce43f9e10a24` | CAMERA_INFO | 读（结构化） |
| `c623f9bd-beae-443b-b5e6-af4652b81343` | CAMERA_MODEL_NAME | 读 |
| `d2a2a363-16a4-43df-89f4-7817be9f0cde` | CAMERA_FM_VERSION | 读 |
| `f665a6cb-aac8-4c58-9601-3534a72f47c1` | CAMERA_SERIAL_NUMBER | 读 |
| `e416bfbd-2716-4976-be32-1bc28c5b6192` | LENS_NAME | 读 |
| `799b5d87-e680-4ddf-bfd7-7b075830aff3` | LENS_FM_VERSION | 读 |
| `d4684037-9580-47e1-98c5-f9d766197e1c` | LENS_SERIAL_NUMBER | 读 |
| `56e01cb5-9941-448c-a84f-671c7cf847b8` | READ_FUNCTION_LEVEL | 读 |
| `12be9f0b-1417-4b9b-85c7-87932213db4e` | GET_QUALITY | 读 |
| `3ee36c7f-0e48-4c47-8446-04b103b771c5` | SET_QUALITY | 写 |
| `419010c2-3a85-47d6-9e71-a1ea58ced881` | READ_WIFI_FREQUENCY_BAND | 读 |
| `e1e91dde-ad9b-4887-9cee-07a8284bdc16` | SET_WIFI_FREQUENCY_BAND | 写 |
| `e92bd99a-723a-092c-fbc3-bc09b9eb5985` | HTTPS_CA_CONTENTS | 读 |
| `1be8a9e3-178b-46c4-b6b3-43d4a5311fc1` | CER_FINGER_PRINT | 读 |
| `565b4253-8bac-46ae-8c5d-ec6f94fc8714` | GPS_INFORMATION | 读 |
| `c289b6a4-b9ee-49ab-ab06-7099bb5edaa8` | GPS_ACTION_START_CMD | 写 |
| `437e6512-321a-4a94-9281-fab1bff49a91` | GPS_ACTION_NOTIFICATION | 通知 |
| `39a02c41-c6e3-4b73-a3ea-537f23f0085a` | TIME_INFORMATION | 读 |
| `289270d6-c07d-46de-bf70-70f5120234d1` | TIME_ACTION_NOTIFICATION | 通知 |
| `16726c35-52ef-4d00-868d-099549a90d9b` | CAMERA_OPERATE_NOTIFICATION | 通知 |
| `21bd7079-2f9a-40ac-91fd-89871a4ac364` | SHUTTER_ACTION_RESULT | 通知 |
| `0b29969b-a89a-4636-8e63-575d416663d6` | IMAGE_TRANSFER_NOTIFICATION | 通知 |
| `72ef8930-887b-47b2-bab0-a2cbbd657300` | IMAGE_TRANSFER_ACTION | 写 |
| `ad390b65-5607-4c01-9a9f-73e9006f9635` | CURRENT_SSID | 读 |
| `702cc3cf-92b2-476c-ae3c-ee9bb9d9aeee` | CONNECTED_SSID_BLOCK | 读 |
| `46fd7afd-e068-4223-9474-062bb373007d` | SSID_BLOCK | 读 |
| `1641e3dc-b07e-4028-b5dc-d09e591b576a` | SSID | 读 |
| `3a42969f-2c83-4a1f-a140-b8f4d08e6062` | AP_PASSWORD_APS | 读 |
| `5c565e17-8fba-4aec-b863-32b9b318bfbd` | SERVER_URL | 读 |
| `ed38e89c-0a0c-4e0b-a3f5-ee0ef2e7fb68` | LIVE_STREAMING_ACTION | 写 |
| `e3285094-b091-4883-8885-93ba7e621136` | LIVE_STREAMING_ACTION_RESULT | 通知 |

补充观察：

- 载荷多为**单字节状态**（如 `AP_STATE`、`ACTION_MODE_RESULT`、`AUTO_TRANSFER_START_NOTIFY` 取 `value[0]`，见 `H5/d.java:76`、`:96`、`:124`），字符串类（SSID/密码/型号/版本/序列号）为 UTF-8（`new String(value, StandardCharsets.UTF_8)`，`H5/d.java:71`）。
- 有一批 UUID 未出现在语义表中但被代码处理（如 `c623f9bd…` 之外还有 `ca1b02cb…`、`ed8b1352…`、`bff12e7f…`、`7644371c…`、`56e01cb5…`、`1641e3dc…`、`3a42969f…`），说明语义表是"常用子集"，完整集需按服务发现结果逐一处理——移植时应**以 UUID 常量驱动，不要假设固定顺序**。
- 连接回调里大量 `synchronized (G0.class)`（一个全局锁类）与 `Handler` 延时：说明厂商在对抗 BLE 回调线程与 UI 线程的竞态，属于典型的"历史包袱"。

### 3.3 相机 REST API 全表（`h6/InterfaceC2329a.java` 逐条转录）

注解解码：`@o`=POST，`@sa.f`=GET，`@k`=Headers，`@i`=Header，`@sa.a`=Body，`@y`=Url，`@w`=Streaming。

**A. 会话与身份（相机）**

| 方法 | 路径 | 请求 | 响应 |
|---|---|---|---|
| POST | `auth` | `{AppInfo, Uuid, FriendlyName}` | `{Header{ResponseCode,Messages}, Data{AuthToken}}`（`bean/AuthRequestBean`、`AuthResponseBean`） |
| POST | `auth`（Rx 变体） | 同上 | 同上 |

**B. 图库/媒体（相机）**

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `media/gallery/count` | 总数（两个重载：无 body `c0` / 带 body `C`） |
| POST | `media/gallery/current-sd` | 当前 SD 槽 |
| POST | `media/gallery/info` | 分目录分页列表（`CommonPagingRequestParamBean`） |
| POST | `media/gallery/thumbnail` | 缩略图（binary/octet-stream，`@w` 流式） |
| POST | `media/image` | 原图（octet-stream，`@w` 流式） |
| POST | `media/image` + `Range` 头 | 断点续传（`d(Authorization, Range, body)`） |
| POST | `media/burst/info` | 连拍组信息 |
| POST | `media/transfer/count` | 待传数量 |
| POST | `media/transfer/info` | 传输任务信息 |
| POST | `media/transfer/notify` | 通知相机"已接收" |
| POST | `auto-transfer/get-content-info` | 自动传输内容概览 |

**C. 遥控拍摄（相机）**

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `remote/get-setting` | 拉取当前设置与**能力集**（曝光/快门/ISO/WB/PhotoStyle…） |
| POST | `remote/set-setting` | 写入设置 |
| POST | `remote/get-state` | 机身状态 |
| POST | `remote/camcmd` | 命令（拍摄/录像/AF/切模式…，见 4.3） |
| POST | `remote/camctrl` | 控制（变焦等） |
| POST | `remote/get-lvport` | 实时取景端口 |
| POST | `remote/start-stream` / `remote/stop-stream` | 开始/停止实时取景流 |

**D. PhotoStyle / LUT（相机）**

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `photostyle/get-setting` | 取当前 PhotoStyle 参数 |
| POST | `photostyle/set-setting`?（`change`） | `photostyle/change` 切换 |
| POST | `photostyle/get-display-setting` / `set-display-setting` | 显示项 |
| POST | `photostyle/get-myphotostyle-setting` / `set-myphotostyle-setting` | 自定义风格 |
| POST | `photostyle/save-current-setting` / `load-preset-setting` | 存取预设 |
| POST | `photostyle/rename` / `rearrange` / `restore-to-default` | 管理 |
| POST | `photostyle/start-stream` | 风格预览流 |
| POST | `lut/info` | LUT 列表/槽位 |
| POST | `lut/send-prepare` → `lut/send`（分块）→ `lut/abort-send` | LUT 下发三段式 |
| POST | `lut/file` | 取回相机内 LUT（`@w` 流式） |
| POST | `lut/rename` / `rearrange` / `delete` / `set-display-setting` | 管理 |

**E. 固件（相机）**

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `firmware/send-prepare` | 开始 |
| POST | `firmware/send`（`Content-Length`+`transID`，octet-stream） | 分块写 |
| POST | `firmware/abort-send` | 中止 |

**F. 社区（云：`https://lumix-base.jpn.panasonic.com/lutapi/v2/`）**

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `community/lut` | LUT 详情 |
| POST | `community/luts/top` | 榜单 |
| POST | `community/luts/filter` | 筛选 |
| POST | `community/genres` | 分类 |
| POST | `community/creators` / `community/creator` / `community/creators/countries` | 创作者 |
| POST | `community/luts/download` | 下载 zip（`Accept: application/zip`） |

**G. 支持站（`https://panasonic.jp/support/share/eww/com/software/lumix_lab/`）**

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `app_version.json` | 版本策略 |
| GET | `firmware_list.json` | 固件列表 |
| GET | `@Url` | 任意资源（图片/说明页） |

客户端配置（`h6/h.java`）：

| 客户端 | BaseUrl | 超时 | 附加头/认证 | 用途 |
|---|---|---|---|---|
| `h()` / `c()` | `https://192.168.54.1/` | 5 s | TLS 固定 | 快速相机调用 |
| `i()` / `l()` | `https://192.168.54.1/` | 15 s | TLS 固定 | 大文件/长任务 |
| `d()` / `e()` | `https://lumix-base.jpn.panasonic.com/lutapi/v2/` | 15 s | `Authorization: Basic base64(":")` + `lutapp-api-key: 111` | 社区 LUT |
| `j()` / `k()` | `https://panasonic.jp/support/share/eww/com/software/lumix_lab/` | 15 s | `Authorization: Basic base64("sub-avcweb:1qaz")` | 版本/固件 |

> 安全提示（移植时**不要照抄**）：`h6/j.java:322` 把 Basic 认证用户名/口令硬编码在代码里（`"c3ViLWF2Y3dlYg=="`→`sub-avcweb`，`"MXFhez=="`→`1qaz`）；`h6/f.java` 是"信任一切"的 `X509TrustManager`；`h6/e.java:11` 硬编码 `lutapp-api-key: 111`。鸿蒙端应改为服务端下发的短期凭据或至少放入 `<security>` 配置并做完整性校验。

错误处理：`h.b(Throwable)`（`h6/h.java:78`）从响应体 `{"Header":{"ResponseCode":N,"Messages":"..."}}` 提取业务错误；`401` 时直接清空 `authToken` 触发重新认证；`m(Throwable)` 把 5xx 作为可重试错误。

### 3.4 USB PTP 通道

- `p6.C3096m`（UsbControl，25 KB）持有 `UsbManager/UsbDevice/UsbInterface/UsbDeviceConnection` 与三个 `UsbEndpoint`（in/out/interrupt），在独立 `HandlerThread("com.panasonic.jp.lumixlab.ptp.usbcontrol")` 上串行收发（`p6/C3096m.java:124-147`）。
- 设备过滤：`Collections.singleton(9095)`（十进制，即 **0x2385 = Panasonic**），见 `p6/C3096m.java:143`。
- 容器解析：`h(byte[])` 按小端读取 `length(int32) → type(int16) → code(int16) → transactionId(int32)`，仅接受 `type == Response`，再按 `q6.C` 枚举匹配结果码（`p6/C3096m.java:149-180`）。
- 结果码枚举在 `q6/C`（如 `OK`、`Undefined`…），事件/操作码在 `q6.EnumC3135A`、`q6.C3136B`；命令构造集中在 `Y5.*`（`Y5.h` 为最大命令工厂），上层通过 `LlcApplication.getPtpSender().c(cmd)` / `.b(cmd, timeoutMs)` 同步调用。
- USB 插入会拉起 `UsbAttachActivity`；配对完成通过广播 `BROADCAST_ACTION_PTP_PAIRING_COMPLETED` 通知 UI（`Z5/Y0.java:47`）。
- 结论：**如果鸿蒙版本只做 Wi-Fi 连接，可以完全跳过 PTP 栈**；若要做 USB 有线控制，则需实现 PTP over USB（HarmonyOS 提供 `@ohos.usbManager`，可 bulkTransfer，等价能力具备）。

---

## 4. 遥控拍摄

### 4.1 能力集协商（`remote/get-setting`）

响应 `Data` 是一组 `{"item": "<键>", "subitem": ["<值>", …]}` 的能力表，共 28 个字段（`K5/C0620c0.java`）：

`exposure`、`shtrspeed`、`focal`、`iso`、`sensitivity_db`、`whitebalance`、`recmode1`、`recmode2`、`photostyle`、`base_photostyle`、`focusmode`、`quality`、`pictureformat`、`jpeg_heif`、`jpeg_heif_quality`、`aspectratio`、`drivemode`、`selftimer`、`lightmetering`、`liveviewsize`、`realtimelut`、`operatepriority`、`videoformat`、`videoquality`、`shtrspeed_syncro`、`shtrspeed_angle`、`crop_zoom`、`Result`。

显示用的"值→本地化文案"映射放在 `assets/*_list.json`，例如：

- `photostyle_list.json`：`{"key":"0x0028","value":["remote_shooting_photostyle_vlog","llc_resource_gallery_opt_photostyle_1"]}` —— PhotoStyle 的**相机侧枚举值（0x00xx）** 与两个资源 key（遥控页文案 / 图库页文案）。
- 同类文件：`exposure_list.json`、`shtrspeed_angle_list.json`、`shtrspeed_syncro_list.json`、`iso_list.json`、`sensitivity_db_list.json`、`whitebalance_list.json`、`drivemode_list.json`、`firm_list.json`、`videoquality_list.json`（61.8 KB，机型差异表）、`videoquality_models_after_mc501_list.json`、`recmode2_c3_custom_mode_list.json` 等 20 余个。
- 这些 JSON 在 `LlcApplication.initRemoteShootingParamMap()` 启动时全部读入内存（`LlcApplication.java:462`），形成 `Map<文件名, Map<key, String[]>>`。

> 移植要点：这是一套"相机固件版本 → 可用值集合"的**兼容性矩阵**，随固件演进。鸿蒙端应把它做成可热更新的配置（云端下发 + 本地缓存），而不是编译进包体。

### 4.2 实时取景（liveview）二进制协议

这是全 App 最"硬核"的自研协议：每帧画面 + 一整套机身状态被打包在一个自定义头部的数据块里，通过 `remote/start-stream`（或 PTP）送到手机。解析器位于 `K5/C0657v0.java`（105 KB，方法 `h(byte[])` 约 1,800 行）与 `K5/Q0.java`（85 KB，另一版本），字段表常量在 `K5/C0646p0`。

**头部字段与宽度（按出现顺序，单位字节）**：

*基础块*

| 字段 | 宽度 | 含义 |
|---|---|---|
| `totalsize` | 2 | 整个数据块长度 |
| `version` | 2 | 协议版本 |
| `seqno` | 4 | 帧序号 |
| `dataflag` | 1 | 标志位 |
| `srcid` | 6 | 源 ID |
| `srcsubid` | 1 | 子源 |
| `datatype` | 1 | 数据类型（图像/状态/扩展） |
| `reserve1` | 1 | 保留 |
| `pts` | 4 | 显示时间戳 |
| `totaldatasize` | 4 | 数据总长 |
| `dataoffset` | 4 | 负载偏移 |
| `exheadersize` | 2 | 扩展头长度 |
| `exheadertype` | 2 | 扩展头类型 |

*变焦块*：`crntzoomval(2)`、`crntzoompos(1)`、`zoommaxchgcount(1)`、`opticalzoommaxpos(1)`、`exzoommaxpos(1)`、`iazoommaxpos(1)`、`digitalzoommaxpos(1)`、`rotation(1)`

*机身块*：`camstatus(1)`、`recmode(1)`、`exflag(1)`、`exflag2(1)`、`numfocusframe(1)`、`Av_max_1/2`、`Av_min_1/2`、`Av_current_1/2`、`Tv_max_1/2`、`Tv_min_1/2`、`Tv_current_1/2`、`Sv_max_1/2`、`Sv_min_1/2`、`Sv_current_1/2`（各 2 字节）、`currentexposure(1)`、`crntfocaldist(2)`、`crntEXzoom(2)`、`numIconCont(1)`、`processingstate(1)`、`assist_ID(2)`、`touch_AE_button(1)`、`Shut_state(1)`、`noise_reduction_time(2)`、`exflag3_vh(1)`、`exflag3(1)`、`buff_size(2)`、`touchaf_button(1)`、`interval_state(1)`、`lens_mount(1)`、`reserve0C(14)`、`numSettingValue(1)`、`numIconCont2(1)`、`numPhotoStyleCont(1)`

*可变数组（长度由上面的计数给出）*

| 数组 | 元素字段 | 用途 |
|---|---|---|
| 对焦框 | `focusframeleft/top/right/bottom(各2)`、`focusframecolor_r/g/b(1)`、`focusframeshape(1)`、`focustriangledisp(1)`、`focal_length(1)`、`focasframe_transparency(1)`、`focus_reserve(1)` | 在预览上画 AF 框 |
| 图标/状态 | `sdIcon1/2`、`sdIcon`、`shootNum(4)`、`shootTime(4)`、`battery(1)`、`batteryBase(1)`、`batteryBackgroud(1)`、`shootingIcon(1)` | 剩余张数/电量/SD |
| 附加图标 | `sdArrow`、`batteryGrip`、`batteryWink`、`usbPower`、`batteryBaseWink`、`batteryBGWink` | 手柄/充电指示 |
| 设置项 | `exposure(2)`、`ss_angle(2)`、`iso(4)`、`db(2)`、`whitebalance(2)`、`recmode1/2(2)`、`recmode2value2(2)`、`photostyle(2)`、`focusmode(2)`、`quality(2)`、`videoformat(2)`、`videoquality(2)`、`aspectratio(2)`、`drivemode(2)`、`selftimer(2)`、`lightmetering(2)`、`liveviewsize(1)`、`realtimelut(1)`、`operatepriority(1)`、`selftimercustom(1)`、`afmode(2)`、`burst1speed(2)`、`burst2speed(2)`、`intervalMotionState(2)`、`sqFPS(2)`、`dualNativeIso(2)`、`hrsMode(2)`、`photoFormat(2)`、`jpegAndHeifMode(2)`、`jpegAndHeifQuality(2)`、`exposureAssist(2)`、`selftimerCountDown(2)`、`shtrspeedCanSet(1)`、`focalCanSet(1)`、`programShift(1)`、`customModeDetailInfo(2)`、`HDMIRAWflag(2)`、`EVStep(2)`、`focusStacking(1)`、`cropZoomFlag(1)` | 叠加到取景 UI 的参数 |
| PhotoStyle 明细 | `photostyle(2)`、`base_photostyle(2)`、`contrast(2)`、`highlight(2)`、`shadow(2)`、`saturation(2)`、`color_tone(2)`、`hue(2)`、`filter_effect(2)`、`grain_effect(2)`、`color_noise(2)`、`sharpness(2)`、`noise_reduction(2)`、`dual(2)`、`iso(4)`、`sensitivity_db(2)`、`whitebalance(2)`、`lut1(1)`、`lut1_opacity(2)`、`lut2(1)`、`lut2_opacity(2)` | 实时 LUT/风格参数 |

解析器按 `dataflag`/`datatype` 分支：先取 `totalsize`，再依 `exheadersize`/`exheadertype` 跳到负载，随后按上表顺序 `ByteBuffer` 顺序读取；遇到 `version` 更高时走 `K5/Q0` 的另一套实现（两套解析器并存，说明协议有 A/B 两代）。

> 鸿蒙移植：这部分是**纯字节协议**，与平台无关，可直接照搬为 ArkTS/NAPI 实现（建议用 `ArrayBuffer` + `DataView`，并保留两套 version 分支）。真正的风险是"字段含义靠命名与 UI 反推"，需要在真机上逐项验证（特别是 `exflag*` 位域）。

### 4.3 命令词汇表（`com/panasonic/jp/lumixlab/util/L.java`）

参数/命令名枚举（`remote/camcmd`、`remote/set-setting` 的键）：

```
photostyle, base_photostyle, quality, videoquality, aspectratio, drivemode, selftimer,
setting, exposure, shtrspeed, focal, iso, sensitivity_db, whitebalance, recmode2,
recmode2C4CustomMode, recmode2C4AnimationExposure, lightmetering, liveviewsize, focusmode,
pictureformat, jpeg_heif, jpeg_heif_quality, recmode1, realtimelut, operatepriority,
videoformat, videoqualityModelsAfterMc501, shtrspeedSyncro, shtrspeed_angle,
autoTransImage, camctrl, capture, capture_cancel, video_recstart, video_recstop,
touchafrelease, recAndPlayMode, lcdOn, program_shift, startStream, stopStream,
crop_zoom, finish
```

即：**参数设置与动作命令共用一套"名字"，通过 `remote/set-setting`（参数）与 `remote/camcmd`（动作）两个端点分派**。动作命令包括拍照、录像启停、触摸 AF、切模式、开屏、程序偏移、直播流启停、裁剪变焦、收尾。

### 4.4 遥控 UI 的复杂度

`RemoteShootingActivity`（~3,000 行）与 `F5/*` 中的大量 `ViewOnClickListenerCxxxx` 共同实现：可滑动参数转盘（复用同一个 RecyclerView 循环滚动）、按能力集动态渲染控件、PhotoStyle/LUT 二级面板、双指变焦、AF 框触摸、状态图标叠加。这部分工作量在鸿蒙端主要落在 **ArkUI 自定义手势 + 转盘组件**，协议不复杂但要还原交互手感。

---

## 5. 图库与传输

### 5.1 浏览

- 首页 `GalleryContainerFragment` 有 3 个数据源：本机相册、相机相册、自动传输目录；相机相册通过 `media/gallery/info` 分页（`CommonPagingRequestParamBean` 携带 `authToken`、目录、分页游标），缩略图按需 `media/gallery/thumbnail` 拉取并落盘缓存。
- 目录结构由 `GalleryInfoResponseBean.DataBean.DataChild` 表达（`GalleryAlbumDirectoryInfo`、`MediaFolderBean`、`MediaItemPath` 等 bean 可见"文件夹/文件"两级模型）。
- 连拍单独一个 Activity（`BurstActivity`）+ `media/burst/info`。
- 评分过滤：`getCameraGalleryFilterRatingMap()`（`LlcApplication`），说明相机侧有 rating 字段可筛选。

### 5.2 传输

- 单文件下载 = `POST media/image`（带 `Authorization` 与可选 `Range`），流式写盘；大文件（RAW/视频）依赖 `Range` 断点续传。
- 传输完成后 `POST media/transfer/notify` 告知相机，随后 `media/transfer/count`/`info` 刷新待传队列。
- 自动传输由 BLE 侧驱动：`AUTO_TRANSFER_GET_SETTING`（读设置）→ `AUTO_TRANSFER_START_CMD`（写 1 字节启停）→ `AUTO_TRANSFER_START_NOTIFY`（1 字节状态）→ 手机主动拉取 → `IMAGE_TRANSFER_ACTION/NOTIFICATION` 处理"单张发送"。
- 传输状态由 `ForegroundService`（前台类型 `CONNECTED_DEVICE`）保活，App 退到后台也会继续（`LlcApplication.onAppBackground`，`LlcApplication.java:559`）。
- 失败/中断语义：`isCancelTransferFiles`、`isCameraCutOffImageTransferWifi`、`isCameraEndStopImageTransfer` 等一堆布尔标志（`LlcApplication` 字段区）——这实际上是**用布尔量拼出来的状态机**，是本项目最值得重构的地方之一。

---

## 6. 直播（Live Delivery）

两端协作，是本 App 商业价值较高的一块：

1. 手机侧用 **YouTube Data API v3** 创建直播间与流：
   - `liveBroadcasts().insert(part="snippet,status,contentDetails")`，`status.privacyStatus` 来自 `R.array.string_array_live_visible_range_param`，`contentDetails.enableAutoStart/enableAutoStop = true`（`util/D1.java:37-59`）。
   - `liveBroadcasts().bind(broadcastId).setStreamId(streamId)`（`util/D1.java:55`）。
   - `liveStreams().insert(part="snippet,cdn")`，`cdn.ingestionType="rtmp"`、`frameRate="variable"`、`resolution="variable"`（`util/D1.java:61-73`）。
   - OAuth scope 只要 `YouTubeScopes.YOUTUBE`（`util/D1.java:29`），凭据 `GoogleAccountCredential.usingOAuth2(...).setBackOff(ExponentialBackOff)`，`setApplicationName("LUMIX Lab")`。
2. 相机侧直接推流：手机把 RTMP/RTMPS 地址交给相机（BLE `LIVE_STREAMING_ACTION` / REST），相机作为推流端；UI 上有 `live_format_btn_youtube` / `live_format_btn_rtmps`（资源名），并对 `rtmp://`、`rtmps://` 做校验（`LiveDeliverySettingFragment.java:536-543`）。
3. 状态机：`LiveDeliveryFragment` → `SettingFragment`（账号/标题/可见范围/画质）→ `WaitingFragment`（等待相机就绪）→ `DeliveringFragment`（直播中），列表页 `LiveDeliveryListFragment`。
4. 分析埋点把平台写成 `"YouTube"`/`"RTMPS"`（`LiveDeliveryWaitingFragment.java:105`）。

> 移植提示：YouTube 直播间创建可以放云端代理（用服务端 OAuth），手机端只负责把 ingestion URL 转给相机；这样鸿蒙端可省掉 Google Sign-In 与 `google-api-services-youtube`（该库在 APK 中占 6,769 个类）。

---

## 7. 云服务、固件与分析

| 能力 | 实现 | 说明 |
|---|---|---|
| 社区 LUT | `lutapi/v2` + `lutapp-api-key` | 榜单/分类/创作者/筛选/下载 zip；图片资源走 `https://lumix-base.jpn.panasonic.com` + `path` 拼接（`E5/*`、`CommunityDownloadFragment.java:3539`） |
| 固件更新 | 支持站 `firmware_list.json` → 下载 → 经相机 REST `firmware/send-prepare|send|abort-send` 分块写入机身 | `FirmwareUpdateListFragment`、`FirmwareUpdateDetailFragment`；进度与"准备/下载中"状态挂在 `LlcApplication` |
| 版本策略 | `app_version.json` | 强制/建议升级 |
| 推送 | Firebase Messaging（`LlcMessagingService`）+ 通知渠道 `lumix_lab_default_notification_channel` | 深链进 `PushNotificationActivity` |
| 分析/归因 | Adobe Experience Platform：`Analytics/Identity/Lifecycle/Signal/Campaign/UserProfile` 六个 Extension，`appId=9a3bddd6f912/decd7ac6e1fc/launch-56ec323a4397` | 埋点 API 被包装成 `C1516b.i("EventName", Map)`，散布在全项目 |
| 用户分层 | `UserSegmentsActivity` + `bean/UserSegmentsBean` | 首次启动问卷 |
| 协议/条款 | `assets/privacy-notice/*`、`license-agreement/*`、`license-oss/*`（HTML）+ 版本号比较 | 多语言 12 份 |
| 深链 | `DeepLinkRouterActivity` + intent-filter | 分享/社区/推送落地 |


---

## 8. 静止图像显影 / 编辑管线

> 注：`RawEditManager` 的类体被 R8 重命名为 `com/panasonic/jp/lumixlab/util/p1.java`（仅内部类 `RawEditManager$CancelCallbackImpl` 因 `@Keep` 保留原名）。下文的 `p1` 即原 `RawEditManager`。

### 8.1 三条渲染路径

`p1.f18139m`（模式字符串）决定走哪条原生内核：

| 模式值 | 触发入口 | 源数据 | 原生内核 |
|---|---|---|---|
| `"RAW2"` | `p1.z(id, path, cb)`（`p1:2371-2392`） | RW2 文件路径（原生自行解包） | `ImageFilter.nativeCnv2` |
| `"RGB"` | `p1.w(id, Bitmap, false)` / `p1.x(id, RGB48, preview, false)`（`p1:2302-2313`） | 已解码位图或 16bit/ch RGB48 字节 | `ImageFilter.nativeCnv2RGB` |
| `"MP4"` | `p1` 视频入口（`p1:377`） | YUV 帧序列 | `ImageFilter.nativeCnv2YUV`（由 `YUVVideoPackage/h.java` 驱动） |

输入分派在 `H5/z.java:2261-2292`：`fileType==0` 走 RAW；`fileType==9 且 Heif.getBitsPerPixel>8` 走 10bit HEIF → `C1517b0.l()` 取 RGB48 → `p1.x()`；其余 JPEG/HEIF/PNG 走 `C1517b0.k()` 解成 `Bitmap` → `p1.w()`。

### 8.2 `com.techor.techorfilter.ImageFilter` 原生接口（`libtechorfilter.so`）

| 方法 | 签名要点 | 语义 |
|---|---|---|
| `initPhotoStyleLUT()` | — | 清空/复位内部 PhotoStyle LUT 缓存（资源缺失时调用） |
| `setPhotoStyleLUT(int,int,float[],int,float[],int,float[])` | (styleIdx, baseN, base[], lowN, low[], highN, high[]) | 传入 1D 基础曲线 + `_low`/`_high` 两个 3D LUT（float 数组；3D 部分为 RGBA 步长） |
| `nativeCnv2(...)`（私有）+ 包装 `a(...)` | **45 个参数**：`AssetManager, Bitmap, int step, float[6], 19×float, 若干 int, float[] lut1,int, float[] lut2,int, float[] lut3,..., int toneLsize,float[] toneL, int toneRsize,float[] toneR, int toneGsize,float[] toneG, int toneBsize,float[] toneB, boolean, CancelCallback` | RAW 主显影内核：结果直接写入传入的 ARGB_8888 `Bitmap` |
| `nativeCnv2RGB(...)` + `b(...)` | 同上形状 | 8/16bit RGB 源显影 |
| `nativeCnv2YUV(...)` + `c(...)` | 多一个 `boolean` | YUV 域（视频帧）显影/输出 |
| `nativeGetRawDecodeLens(...)` + `d(...)` | `(AssetManager,int[],int,int,int,int,int,float[],float[],CancelCallback)` | 取 RAW 镜头/阴影校正表 |
| `nativeReadExifAndUnpack(...)` + `e(...)` | `(byte[],float[],int[],float[],CancelCallback)→String` | 读 EXIF + 解包 RAW 到 float[]，返回尺寸/信息 |
| `calcDBBMinMax(int,float,float[])` | — | 依据色温算白平衡 tint 的可用区间并裁剪 |
| `getUseToneL(int,float[],int,float[],float,float)` | (4096, dst, size, src, shadow, highlight) | 把控制点曲线展开成 4096 点查找表（含高光/阴影） |
| `initRGBArray(int,byte[],int,int,int,boolean)` | `pixelMax=65535` 时即 16bit | 把解码后的像素送入原生缓冲 |
| `initYUVArray(int,byte[],byte[],int,int,int,boolean)` | Y 平面 + UV 平面 | 视频帧源 |
| `setHSLorSPLTone(float[],int)` | idx 0..7 = HSL 8 色；8/9/10 = 分离色调 阴影/中间/高光；`-1` = 复位 | 逐项推送颜色调整 |
| `freeAllImageData()` | — | 释放全部原生缓冲 |

> 这套 API 是"**参数位置即协议**"的典型：45 个参数没有任何结构体封装，改一个参数含义就可能整体错位。移植时若不能复用该 `.so`，基本等于重写显影内核。

### 8.3 编排器 `p1`（单例）的关键状态与方法

- 单例：`p1.j()` / `p1.k()` / `p1.l()`（`p1:295-363`）；原生回调 `RawEditManager$CancelCallbackImpl.shouldCancel(int,int)` 读 `p1.f18126H` 实现取消（`p1:110-116`）。
- 关键字段：`ImageFilter f18125G`、当前/下一份 `RawProcessingConfigBean f18123E/f18124F`、`Bitmap f18152z`、`float[] f18140n = new float[4096]`（tone LUT）、`ExecutorService f18128b`（单线程串行渲染）、`f18134h = 4096`（tone 表长度）、`f18131e/f18132f`（宽/高）。
- 渲染主函数：`Q(float scale, int paramId)`（`p1:650-1069`）——
  1. 从 `RawProcessingConfigBean` 取全部参数（`672-714`）；
  2. 按 `paramId` 做**增量更新**（`718-882`）：0 曝光、1 亮度、2 对比、3 高光、4 阴影、6 饱和、7 色温、8 tint(÷1000)、10 锐化、11 颗粒（按 `noiseCFlag` 走 L 或 C）、12 降噪、13 暗角、30 白场、31 黑场、32 噪声-C 标志、33 自然饱和、34 rpf；id 5 = LUT 强度（无 case，走默认分支）；
  3. 风格变更则重载 PSL1（`884-886`）；
  4. `getUseToneL(...)` 生成 tone LUT（`896-902`）、`h(...)` 生成 LUT 数组（`903-904`）、`calcDBBMinMax` 裁剪（`1032`）；
  5. 分派 `a(...)`（RAW2，`1043-1048`）或 `b(...)`（RGB，`1051-1052`），目标位图 `Bitmap.createBitmap(w,h,ARGB_8888)`（`892`）；
  6. RAW 路径再做方向（6/8）与可选降采样 `J()`（`483-517`）。
- 预览/全尺寸两套：`t()`（预览，`1542-1809`）、`u()`（`1811-2049`）、`v()`（降采样预览，`2051-2300`）、`R()→S()`（全尺寸，`1071-1104`）。
- 其它：`P(cameraId, styleRawIndex)` 装载 PSL1（`575-647`）；`o()` 装载用户 LUT（`1413-1496`）；`b()` 计算 WB tint（`1222-1238`）；`G()` 注入配置、`H()/I()` 复位 HSL、`K()/M()` 生命周期。

### 8.4 编辑参数模型（`bean/RawProcessingConfigBean`，1,027 行）

这是真正的"参数中枢"（`EditInfoEntity` 只是它的持久化投影，通过 `initData(EditInfoEntity)` `:503-606` 与 `syncToEditInfoEntity` `:892` 双向同步）。

| 配置字段 | 默认值 | 对应 DB 列 | 作用 |
|---|---|---|---|
| `brightness` | 0.0 | `edit_exposure` | 曝光（内核里按 2^brightness 用） |
| `brightnessAdd` | 0.0 | `edit_brightness` | 亮度附加 |
| `contrast` / `contrast_center` | 1.0 / 0.461 | `edit_contrast` | 对比及支点 |
| `highlight` / `shadow` | 0.0 / 0.0 | `edit_highlight` / `edit_shadow` | 高光/阴影（进 tone LUT） |
| `kelvin` / `dbb` | 5500 / 0.0 | `edit_whitebalance` / `edit_white_balance_tint÷1000` | 色温/色调 |
| `sat` / `naturalSat` | 1.0 / 1.0 | `edit_saturation` / `edit_natural_sat` | 饱和/自然饱和 |
| `gamma` | 1.0（RGB 模式强制 2.2） | — | 伽马 |
| `sharpFactor` / `nrLevel` / `cromaNrLevel` | 0/0/0 | `edit_sharp` / `edit_gaussianBlur` | 锐化/降噪 |
| `noise_L` / `noise_C` / `noiseCFlag` | 0/0/0 | `edit_granular` / `edit_noise_c_flag` | 颗粒（亮度/彩色二选一） |
| `shadingFact` | 0.0 | `edit_vignette` | 暗角 |
| `bklevel` / `wtlevel` | 0.0 / 1.0 | `edit_bk_level` / `edit_wt_level` | 黑/白场 |
| `rpfLevel` | 0 | `edit_rpf_level` | 细节/锐度档 |
| `cubeFact` / `cubeFact2` | 1.0 / 1.0 | `edit_lut_intensity` / `edit_lut2_intensity` | 两张 LUT 的混合强度 |
| `hslMap` key 1..8 / 9..11 | 0,0,0 | `edit_hsl_*` / `edit_splite_*` | HSL 8 色 + 分离色调 3 段 |
| `toneL/R/G/BData`+`*lutSize` | 由控制点字符串生成 | `edit_tone_point_{white,red,green,blue}` | 4 条 RGB 曲线 |
| `step,width,height,photoStyleRawIndex,cameraID,yuvDR,lut3DSize` | 1,0,0,-1,0,0,0 | — | 渲染上下文 |

进入 RGB 模式时的默认覆盖：`kelvin 6500`、`dbb 0.003`、`contrast 1.15`、`gamma 2.2`（`p1:1395-1411`、`1502-1515`）；`t()` 还会把 5500→6500、1.0→1.15、1.0→2.2、0.0→0.003 做归一（`p1:1617-1623`）。

### 8.5 PhotoStyle LUT（PSL1）格式（已逐字节验证）

```
偏移  长度  含义
0     4     magic 'PSL1'（小端 int32 = 0x314C5350 = 827085648）
4     1     kind：0 = 1D 曲线；1 = 3D LUT
5     4     size：1D 为 2048；3D 为 33（即 33³ 网格）
9     1     encoding：1 = float16（half）
10    64    UTF-8 名称（如 "standard" / "standard_high" / "standard_low"）
74    14    保留
合计  88 字节
```

负载：
- 1D（kind=0）：`size` 个 half → float（4184 B 文件 = 88 + 2048×2）。
- 3D（kind=1）：`size³` 个节点，每节点 3 个 half（R,G,B），Java 侧解码时每 3 个值后插入一个 `0.0f` 形成 RGBA 步长（215,710 B = 88 + 33³×3×2）。

数值观察：half 解码后背离 [0,1]（可出现负值，如 `standard_high` 前几个节点 0.0545、−0.0087、−0.0050），说明它是**对数/宽色域的映射表**，不是可直接 clamp 的显示 LUT。

装载：`p1.P()` 按 `h1` 的机型映射（100 S5M2、101 G9M2、102 GH7、103 S9、104 S1M2、105 S1M2E、106 S1RM2、107 L10，`util/h1.java:9-16`）与 `k1`(AsShot 风格)/`j1`(风格名) 拼出 `<style>.bin`、`<style>_high.bin`、`<style>_low.bin`，分别经 `F0.e()/F0.d()` 解析后一次性交给 `setPhotoStyleLUT(...)`（`p1:629`）；文件缺失则 `initPhotoStyleLUT()` 回退（`p1:608,617`）。

### 8.6 导出与元数据

- 保存入口 `H5/RunnableC2315a.java:147-226`：`C1517b0.Y(entity)` 解码（上限 8144 px）→ 裁剪/旋转 → 全尺寸显影 `p1.R(-1,-1,1)` → `C1517b0.W()` 合成 → 相框模板 `H5/z.t()` → `C1517b0.d0()` 写媒体库。
- 输出格式：`C1517b0:2546` 把 `JPEG` 之外的枚举映射为 **HEIF**；文件命名 `<原名>_lab.hif` / `<原名>_lab`，目录 `DCIM/LUMIXLab`（`C1517b0:2548-2555`）。
- JPEG 编码：`Bitmap.compress(JPEG, quality, BAOS)` 后按 8 KiB 分块写入并回调进度（`N6/C2885f.java:16-48`）。
- HEIF 编码：**不是 libheif**，而是 `MediaMuxer(output, 3 /*HEIF*/)` + MediaCodec HEVC still 编码器（`o0/C2912p.java:15-20`、`o0/C2910n.java:13-27`），可选 `createInputSurface()` + EGL/GLES20 上传（`o0/C2910n:27-58`、`o0/C2898b`）。
- `libheif/libde265` **只用于解码**：`util/Heif/Heif.decodeToRgb48ByteArray()`（16bit/ch RGB48）+ `getBitsPerPixel()`（`util/Heif/Heif.java:15-17`），服务于 10bit HEIF 源。
- EXIF/XMP：`C1517b0.j0/k0` 逐字段复制 Exif，`Software = "Panasonic LUMIXLab"`，`DateTime` 更新为当前时间，XMP 中插入/更新 `<xmp:Rating>`，MakerNote/UserComment 原样搬运，缩放时改写 `PixelXDimension/YDimension`（`C1517b0:1405-1724`）。

### 8.7 GPU / CPU 分工（重要）

| 环节 | 执行单元 | 证据 |
|---|---|---|
| 显影主内核（去马赛克后全部像素运算） | **Vulkan compute**（GPU） | `libtechorfilter.so` 含 `libvulkan.so`/`vkCreateInstance`/`computeheadless`/`.spv` 字符串；APK 提供 36 个 SPIR-V（`preProcess`、`firstProcess`、`cnv*`、`nrFirst..nrFifth`、`yccCNR`、`yccBlurH/V`、`sharpProcess`、`lensProcess{A,D}`、`GaussH/V`、`backend*`、`convertYUV420toRGB16`、`frontEnd`）；Java 侧零引用（由 native 内部加载） |
| 预览/局部效果的 Java 侧滤镜链 | **OpenGL ES 2.0**（GPUImage：`jp.co.cyberagent.android.gpuimage` + `com.panasonic.jp.lumixlab.widget.GPUImage*`） | `util/C1539k0` 组装 `GPUImageFilterGroup`（LUT/暗角/HSL/分离色调/RGBA 曲线/颗粒/锐化/高斯/曝光/亮度/对比/高光阴影/WB/饱和）；`util/C1541l0` 为纯 LUT 组；`util/C1543m0` 为相框组 |
| HEIF 编码上传 | EGL/GLES20（把 Bitmap 传给编码器 input surface） | `o0/C2910n:27-58`、`o0/C2897a/C2898b/C2913q`；`H6/a.java` 是 EGL14 封装（被 `j6/*` 媒体类使用） |
| 10bit → P010 / NV12 | CPU（native，`libllc`） | `LlcApplication.nativeRGB10ToHalfFloat` 等；但**在静止图导出路径上无 Java 调用点**，仅视频编码侧用到 P010（`j6/i.java:115`） |

结论：**静止图导出实际是 8bit 输出**（编码输入为 `Bitmap`），16bit 只存在于显影中间态；HDR/10bit 输出能力主要服务视频。

### 8.8 对鸿蒙移植的含义

1. `libtechorfilter.so` 是 Vulkan compute 内核，**理论可移植**（Vulkan 在 OHOS 可用），但需要：拿到 ARM64 ELF 的 OHOS 兼容构建（bionic vs musl/ohos libc 差异、`AssetManager` 依赖需替换）。
2. 若不能复用：必须自研"RAW 解包 + 去马赛克 + 降噪/锐化 + 镜头校正 + 色彩矩阵 + 曲线/HSL/分离色调/LUT"整链；可复用的是 36 个 SPIR-V 的**算法意图**（若能在无参数说明的情况下反推每个 shader 的 uniform 布局，工作量仍很大）。
3. `p1` 的参数语义（8.4 表）与 `PSL1` 格式（8.5）是**可以完整复刻**的部分，建议先做"参数模型 + LUT 引擎"，再替换底层渲染实现。
4. 导出链路（JPEG/HEIF + EXIF/XMP）在 OHOS 上需重写：`ImagePacker`（JPEG/HEIF 能力依版本）+ 自写 EXIF/XMP 写入（可移植 `com.drew` 的算法或自实现）。


---

## 9. 视频编辑 / 转码管线

> 结论先行：视频与图像**共用同一个色彩引擎**（`libtechorfilter`），但**导出完全不经过 FFmpeg**，而是 `MediaCodec`(Surface 输入) + `MediaMuxer` 的 8 节点自研管线；FFmpeg 只用于"取帧当缩略图/读元数据"。

### 9.1 两套互不重叠的媒体栈

| 栈 | 目的 | 技术 | 关键类 |
|---|---|---|---|
| 预览/拖动 | 编辑页实时预览、逐帧 scrub | `MediaExtractor` + `MediaCodec`（`COLOR_FormatYUV420Flexible`）+ `Image` 平面 + libyuv + `libtechorfilter` + `AudioTrack` | `util/videoEdit/YUVVideoPackage/{C,d,h,j,q,...}` |
| 导出/转码 | 生成成片 MP4 | `MediaExtractor` + `MediaCodec`(解码) + 变速节点 + `MediaCodec`(Surface 输入编码) + `MediaMuxer` | `e6.e` + `j6.{g,i,o,k,a,c,f,e}`（`G6.f` 节点框架） |

另外还有两处旁路：`D6.j` 是一个 daasuu 风格的 GPU 转码器，仅用于生成 `temp_mp4lite.mp4`（`D6/j.java:106-109`）；`O0/C2912p` 的 HEIF 编码器（见 8.6）。

### 9.2 预览栈（`YUVVideoPackage`）类职责

| 类 | 职责 | 证据 |
|---|---|---|
| `C` | 预览总控：持有 `MediaExtractor`/`MediaCodec`/4 个工作线程 + 2 个 HandlerThread，队列容量为 1 | `C.java:207-226`、`:164-165` |
| `d` | 音频解码 + `AudioTrack` 渲染 + 变速 | `d.java:23-26` |
| `j` | 第二个视频解码器，专门产 seek/scrub 帧 | `j.java:117`、`:230` |
| `h` | 预览会话单例：滤镜引擎、速度曲线、时间记账、进度 LiveData | `h.java:33`、`:191-194` |
| `w`/`x` | YUV 帧（3 平面 + pts）/ 单平面（rowStride、pixelStride、Buffer），对象池 20 | `w.java:12-45`、`x.java:9-15` |
| `q` | 平面 → NV12、缩放到高 1080（libyuv） | `q.java:20-39`、`:60-152` |
| `z` | 滤镜线程任务 DTO（y,u,w,h,pts） | `z.java:11-23` |
| `l` | 100 槽环形均值 = 实测解码帧率 | `l.java:24-51` |
| `m`,`o`,`n`,`e` | Sonic 风格变速（时间伸缩）+ PCM 重采样/打包 | `m.java:75-80`、`o.java:8-53`、`n.java:62-75`、`e.java:26-34` |
| `p` | 变速曲线求值（二分 + 线性插值），供播放使用 | `p.java:86-141` |
| `B`,`y` | 命令枚举（PLAY/PAUSE/SEEKTO）、状态枚举 | `B.java:4-8`、`y.java:4-24` |

数据流：`MediaExtractor.readSampleData` → `MediaCodec` 解码 → `Image` 平面 → `q` 转 NV12 并缩放到 1080p → `ImageFilter.initYUVArray(...)` → `ImageFilter.c(...)`（46 参数，`nativeCnv2YUV`）→ `Bitmap` → 主线程旋转 → `VideoBitmapBean` 给 ViewModel（`Q0/s.java:64-107`、`C.java:549-621`）。

要点：
- 预览请求 `COLOR_FormatYUV420Flexible`（`2135033992`），并从 `INFO_OUTPUT_FORMAT_CHANGED` 读取真实 `color-format`/`stride`/`slice-height`（`j.java:215-233`、`r.java:236-245`）。
- 帧节奏：`fps_avg / ((1000/fps_target)/speed)` 决定丢帧或重复；`fps_target` 默认 30，可从媒体 `frame-rate` 覆盖（`r.java:131`、`C.java:169`、`EditActivity.java:2314-2315`）。
- seek 走 `extractor.seekTo(us, 0)` + `codec.flush()`，暂停态 scrub 由独立的 `j` 解码器出帧（`s.java:62-75`、`:29-61`）。

### 9.3 音视频同步（实际实现）

`AvSyncController` 这个类在最终 DEX 中**并不存在**（R8 已内联/移除），只剩一个恒返回 `false` 的 `AvSyncController$CancelCallbackImpl`。真正可观测的同步逻辑是：

- 漂移量 `drift = (now − position) * speed / 1000`，clamp 到 `0…500 ms`，再减 30 ms，用 `Thread.sleep()` 丢掉多余时间；`> 200 ms` 时不 sleep（`d.java:220-234`）。
- 当 `h.f18295d` 为真（高倍速）时**完全跳过音频**（`d.java:235`）。
- 导出侧靠 `VSAVMuxer` 的 1 秒领先窗口 + `ReentrantLock`/`Condition` 交错写两个 track（`J6/a.java:151-167`）。

### 9.4 导出节点图

`E6.e.d(...)`（`e6/e.java:254-265`，边 `:350-359`）构建 8 个节点、两条链：

```
VSSourceReader(video) → VSVideoDecoder → VSVideoSpeedShaper → VSVideoEncoder → VSAVMuxer
VSSourceReader(audio) → VSAudioDecoder → VSAudioSpeedShaper → VSAudioEncoder → VSAVMuxer
```

编码参数（**内联在代码中，无配置 Bean**）：

| 项 | 值 | 证据 |
|---|---|---|
| 视频 color-format | `0x7F000789`（`COLOR_FormatSurface`）+ `createInputSurface()` | `j6/k.java:153-235` |
| bitrate | 源 `bitrate`，缺失时按面积阶梯（60M/35M/20M/10M/6.4M 级） | `e6/e.java:196-201` |
| frame-rate | 24 或 30 | `util/Q0.java:619`、`H5/RunnableC2319e.java:78-82` |
| i-frame-interval / bitrate-mode | 1 / 1（CBR） | `j6/k.java:153-235` |
| 10bit profile | AVC High10(16) / HEVC Main10(2) / AV1(2) + color-standard 6、transfer 7、range 1 —— 但调用方把 10bit 标志强制为 `FALSE` | `j6/k.java`、`e6/e.java:302` |
| 音频 | `audio/mp4a-latm`、`aac-profile=2`（AAC-LC）、默认 64 kbps | `j6/e.java:76-82`、`e6/e.java:223` |
| 容器 | `new MediaMuxer(outPath, 0)`（MP4），track0=视频、track1=音频 | `j6/a.java:107` |
| 音频丢弃 | 变速 ≥ 5× 时**不写音频轨** | `j6/a.java:182` |
| 输出路径 | `getExternalFilesDir(DIRECTORY_MOVIES)/<name>.mp4` | `util/Q0.java:594-599` |

### 9.5 变速曲线：数据模型与数学（可 1:1 复刻）

**数据模型**（`EditInfoEntity`）：
- `editSqType`：`Straight_Line | Gaussian | EaseInOut | EaseOutIn | EaseInOut1 | EaseOutIn1 | UNKNOWN`（`U5/EnumC3385b.java:5-13`）
- `editSqSpeed`：固定倍速（直线模式）
- `editSqPoints`：JSON，形如 `{TYPE:[{x,y},…]}`，最多 10 个锚点，x、y∈[0,1]
- 默认锚点：y=0.5（1×）附近 ±0.25

**UI 约束**：x 排序、首尾强制 0/1、钳制在 [0,1]（`SpeedCurveGraphView.java:224-233`、`:746-816`、`:139-147`）。

**y → 倍速映射**（权威实现，导出与预览共用，`YVP/h.java:181-189`）：

```
speed(y) = 1 / (5 − 4·(y/0.5))          , y ≤ 0.5
         = (y − 0.5)/0.25 · 4 + 1        , 0.5 < y ≤ 0.75
         = (y − 0.75)/0.25 · 5 + 5       , y > 0.75
⇒ y=0 → 0.2×；y=0.5 → 1×；y=1 → 10×（保留 2 位小数）
```

**曲线插值**：`L6.a.a(ptsUs)` 先归一化 `t = clamp(pts/duration)`，定位所在段，用相邻 4 个锚点做 **Catmull-Rom** 三次插值，结果 clamp 到 `[0.2, 10]`（`L6/a.java:19-47`）；常量倍速模式直接取 `editSqSpeed`。

**PTS 变换**：`out += (inPts − lastInPts) / speed(inPts)`，首次调用返回 0 —— 即输出时长 = ∫dt/speed（`L6/h.java:19-39`，日志 tag `VideoPtsTransformer`）。

**CFR 重采样**：`frameIndex = out·fps/1e6`；慢放时循环重复上一帧、快放时丢帧（`j6/o.java:245-281`）。

### 9.6 进度、取消与回调

- 进度不是百分比回调，而是 `MutableLiveData<Long>` 的"当前输出位置"（`YVP/h.java:111`），百分比由 `(pos−start)*100/(end−start)` 推导（`h.java:245-251`），每输出一帧更新（`j6/o.java:246`、`:414`）。
- 完成/失败/取消：`e6.d{a,b,c}` → 适配器 `P0`（`util/P0.java:27-54`）或 `C2328n`（`H5/C2328n.java:26-78`）。
- 取消：UI 置 `Q0.h().f17943a = true` → `E6.d.a()` → 新线程调用 `E6.e.a()` 销毁全部节点（`Z5/ViewOnClickListenerC4027w5.java:50-72`、`H5/z.java:2610-2625`）；节点级 `Future.cancel(true)` + EGL/Surface/Codec 释放，join 超时 200 ms–3 s。

### 9.7 第三方媒体组件在本 App 中的真实角色

| 组件 | 实际用途 | 证据 |
|---|---|---|
| **FFmpeg**（`libav*` + `libffmpeg_mediametadataretriever_jni`） | **只用于取帧/元数据**：`wseemann.media.FFmpegMediaMetadataRetriever.getFrameAtTime()`；其余地方只借用其字符串常量（`"bitrate"`/`"rotate"`/`"duration"`） | `wseemann/media/FFmpegMediaMetadataRetriever.java:61-68`、`util/C1517b0.java:92-98` |
| **androidx.media3 / ExoPlayer 1.0.0-rc01** | **只用于播放**（预览控件 `widget/Y`、`widget/u1`），从不参与导出 | `widget/Y.java:553`、`widget/u1.java:435`、`F0/S.java:208` |
| **com.daasuu.gpuv** | GL 滤镜/预览原语（`GlPreviewFilter`、`GlFilterGroup`），无 `mp4composer` 包 | `D6/c.java:106`、`widget/P.java:198` |
| **libyuv**（`io.github.crow_misia.libyuv`） | YUV 平面转换与缩放 | `YUVVideoPackage/q.java:30,60,140` |
| **libtechorfilter** | 每帧色彩处理（与静止图同一引擎） | `YUVVideoPackage/h.java:459-489` |

### 9.8 对鸿蒙移植的含义

1. **不需要 FFmpeg 就能完成剪辑/变速导出**：OHOS 的 `@ohos.multimedia.avcodec`（AVCodec）+ `AVMuxer` 等价能力齐全；但"Surface 输入编码 + 节点图调度"需要自己搭（可用 TaskPool + 有界队列）。
2. **变速数学可直接复刻**（9.5 的三段映射 + Catmull-Rom + PTS 积分 + CFR 重采样），这是本模块最有价值的可复用资产。
3. 高倍速丢音频、10bit 关闭等行为是**产品决策**而非技术限制，移植时应与产品确认是否保留。
4. 若必须支持源文件"任意编码/封装"（如 HEVC 10bit、MOV），则仍需自带 FFmpeg（为 OHOS 交叉编译）作为兜底解码器。
5. 预览的"逐帧 scrub + 双解码器"在 OHOS 上可用两个 `AVCodec` 实例 + `seek` 实现，注意 OHOS 的 surface/texture 输出模式与 `Image` 平面读取差异。


---

## 10. LUT 体系与端侧 AI（Magic LUT）

### 10.1 四类"LUT"资产及其角色

| 类型 | 位置 | 格式 | 作用 |
|---|---|---|---|
| PhotoStyle LUT（相机机型专属） | `assets/photoStyleLUT/<CAM>/*.bin`（426 个） | `PSL1` 二进制（见 8.5） | 复现各机型 PhotoStyle 的官方色彩（含 `_low`/`_high` 曝光分段） |
| 风格转换 LUT | `assets/models/mergeLut/*.cube`（13 个） | 文本 `.cube`（`LUT_3D_SIZE 33`） | 把各 PhotoStyle 映射到 V-Log，供 Magic LUT 结果合并 |
| 预置/下载 LUT | `assets/*.cube`（5 个）+ 用户导入 | `.cube` / `.tone` | 用户可选的"滤镜"（`pre_installed_lut_list.json` 记录了 `code`/`photoStyle`/`lutSource:"DL"`） |
| AI 生成 LUT | `<externalCacheDir>/lut_temp/lut_output_<ts>.cube` | `.cube`（33³，`TITLE "Generated by ALG"`） | Magic LUT：由 ViT 模型从参考图预测 |

LUT 的工作目录与缓存：

- 生成/临时目录：`C1517b0.J()` = `getExternalCacheDir()/lut_temp`（`util/C1517b0.java:314-315`），启动时会被清理（`clearLUTTemp`）。
- 用户 LUT 缩略图/位图：`getExternalFilesDir("lut_bitmap")`（`C1517b0.java:303`）。
- 索引：Room `lut_info`（字段见 11.1），`lut_source` 区分来源（`DL`、`magicLut`、相机等）。

### 10.2 `.cube` / `.tone` 的解析

- `.cube`：`C1517b0.T(String)`（`C1517b0.java:525` 附近）读取 `TITLE`、`LUT_3D_SIZE`，然后按行解析 R G B 三元组；行序为 R 外层、G 中层、B 内层（Magic LUT 生成器写文件时的循环顺序即 `for r for g for b`，`:111-118`）。
- `.tone`：`F0.e(...)` 读取 `LUT_SIZE`（示例 `LUT_SIZE 33`）与 33 个浮点（1D 曲线），用于曲线类调整（`assets/LUTFile/*.tone`）。
- 应用侧：两张 LUT 可同时存在（`lut1`/`lut2` + 各自 opacity，`EditInfoEntity.edit_lut_intensity` / `edit_lut2_intensity`），最终交给 `ImageFilter` 的 LUT 参数位。

### 10.3 相机侧 LUT 模型与下发协议

相机把 LUT 当作"槽位资源"，DTO 揭示了完整模型：

- 列表项（`bean/LutCameraBean.DataBean.DataListBean`）：`LutId`、`LutName`、`LutType`、`PhotoStyle`、`index`、`select`、`LutGrainEffect`、`LutColorNoise`、`LutSharpness`、`LutNoiseReduction`、`Visibility`、`Selectable`。
  即**相机内 LUT 自带颗粒/色噪/锐化/降噪参数**（与 `lut_info` 的同名列一一对应）。
- 上传请求（`bean/LutCameraPostBean`）：`AuthToken`、`DestinationId`、`FileSize`、`LutId`、`PrimeId`、`Visibility`、`bufsize`、`filename`、`LutRename`。

三段式上传：

```
1) POST lut/send-prepare   {filename, FileSize, ...}
   ← Data{Result, bufsize, errorinfo}        // bufsize = 相机接受的分块大小
2) 循环 POST lut/send      Header: Authorization, Content-Length, transID
                           Body: application/octet-stream（每块 ≤ bufsize）
3) 失败则 POST lut/abort-send；完成后 lut/info 刷新列表
   （重新命名 lut/rename、排序 lut/rearrange、删除 lut/delete、显示设置 lut/set-display-setting）
```

固件下发走完全同构的三段式（`firmware/send-prepare` / `firmware/send` / `firmware/abort-send`），只是 `transID` 与体积不同。

### 10.4 社区 LUT（云端）

- Base：`https://lumix-base.jpn.panasonic.com/lutapi/v2/`（`h6/h.java:167`）。
- 鉴权：`Authorization: Basic base64(":")`（空用户名/密码）+ `lutapp-api-key: 111`（`h6/d.java:141`、`h6/e.java:11`）——**公开内容 API，无用户态**。
- 端点：`community/luts/top`、`community/luts/filter`、`community/lut`、`community/genres`、`community/creators`、`community/creator`、`community/creators/countries`、`community/luts/download`（`Accept: application/zip`）。
- 图片资源：`https://lumix-base.jpn.panasonic.com` + `path`（`E5/*`、`CommunityDownloadFragment.java:3539`）。
- 下载产物是 zip，解包后得到 `.cube` 并入库（下载/赞/收藏计数见 `CommunityInfoEntity{community_code, community_praise}`）。

### 10.5 Magic LUT（端侧 ViT 推理）——完整链路

调用点：`G5/CallableC2193k.java`（case 1，`Callable<String>`，由编辑页/LUT 页触发）。逐步骤：

1. **输入预处理** `C1566x.a(Bitmap)`（`util/C1566x.java:28-68`）：
   - 先把 Bitmap 以 **JPEG quality=100** 重新编码（统一来源差异），
   - `inSampleSize` 取 2 的幂，使采样后仍 ≥224×224，
   - 再 `createScaledBitmap(224, 224, true)`，
   - 输出 **`FloatBuffer(150528) = 3×224×224`**，**平面 CHW 布局**：R 在 `[0,50176)`、G 在 `[50176,100352)`、B 在 `[100352,150528)`，值 = `channel/255.0f`。
2. **建会话**（`CallableC2193k.java:228-241`）：
   - `OrtEnvironment.getEnvironment()`；
   - 从 assets 读入整包模型 `models/PI_3D_LUT_v1.0.0_model_B_fp16.ort`（`open.available()` 一次性读入 `byte[]`）；
   - `SessionOptions`：`OptLevel.ALL_OPT` + `ExecutionMode.PARALLEL`（未显式设线程数/未用 NNAPI）；
   - `environment.createSession(bytes, opts)`。
3. **推理**：`OnnxTensor.createTensor(env, floatBuffer, new long[]{1,3,224,224})`；`session.run(Map.of("image", tensor))` —— **输入张量名固定为 `"image"`**。
4. **输出解析** `C1566x.c(float[][][][] /* [3][33][33][33] */)`（`C1566x.java:95-131`）：
   - 取 `run.get(0).getValue()` 强转 `float[][][][][]`，取 `[0]`；
   - 写文本：`TITLE "Generated by ALG"` / `LUT_3D_SIZE 33` / 空行 / 33³ 行 `"%.6f %.6f %.6f"`（R,G,B），顺序 `for r(33) for g(33) for b(33)`；
   - 文件名 `lut_output_<currentTimeMillis>.cube`，落在 `C1517b0.J()`（`.../lut_temp`）。
   → 因此**模型输出就是一张 33³ 的 3D LUT**（形状 `[1,3,33,33,33]`，通道优先）。
5. **与 PhotoStyle 合并**（`CallableC2193k.java:262-292`）：
   - 若当前 PhotoStyle ≠ `"VLOG"`，查 `C1564w`（`util/C1564w.java`）把风格代码映射到 `mergeLut/*.cube`：

     | 风格代码 | 合并 LUT |
     |---|---|
     | NAT / PORT / STD | `NAT_to_VLOG_2nd.cube` / `PORT_to_VLOG_2nd.cube` / `STD_to_VLOG_2nd.cube` |
     | VIVD / LAND / FLAT | `VIVID_to_VLOG_2nd.cube` / `LAND_to_VLOG_2nd.cube` / `FLAT_to_VLOG_2nd.cube` |
     | LCLASN / LCLAS / LCLASG | `LCNEO_to_VLOG_2nd.cube` / `LCLAS_to_VLOG.cube` / `LCLASG_to_VLOG.cube` |
     | CNEV2 / CNED2 / CNEA2 / 709L | `CINEV2_to_VLOG_2nd.cube` / `CINED2_to_VLOG_2nd.cube` / `CINEA2_to_VLOG_2nd.cube` / `709LIKE_to_VLOG_2nd.cube` |

   - 把该 cube 从 assets 复制到 `lut_temp`，再 `LlcApplication.mergeCubeFiles(baseCube, generatedCube, outCube)`（native `libcube_merge.so`），**返回 0 表示成功**，成功后用合并结果替代生成的 cube；
   - 因此"Magic LUT 结果 = 模型预测的通用 look × 当前 PhotoStyle→V-Log 的逆映射"。
6. **登记**：`C1566x.d(path, styleCode)`（`C1566x.java:133-179`）在 cube 文件头**插入/替换注释行** `#LUMIXPHOTOSTYLE <styleCode>`（插到 `LUT_3D_SIZE` 之前，`b()` `:70-93`）。
7. **落库与生命周期**：生成的 LUT 以 `lut_source = "magicLut"` 写入 `lut_info`；启动时 `clearLUTTemp()` 会删除**未被任何 `edit_info.edit_lut_id` 引用**的 magicLut 记录与文件（`LlcApplication.java:410-459`），并把 `DEVICE_HAS_MAGIC_LUT` 置空。也就是说 Magic LUT 是"**临时产物，除非被编辑引用**"。

失败与资源处理：`OrtException` / 其它异常返回 `null`；`OutOfMemoryError` 返回字符串 `"oom"`（上层据此提示）。会话、环境、Tensor 均显式 `close()`。

### 10.6 模型文件本体（观测）

| 项 | 值 |
|---|---|
| 文件 | `assets/models/PI_3D_LUT_v1.0.0_model_B_fp16.ort`，58,195,688 B |
| 容器 | ORT 格式（flatbuffer，magic `ORTM`，首 4 字节为长度前缀 `14 00 00 00`） |
| 精度 | fp16（文件名与图中 `Cast` 节点"cast node to cast from float16 to float32 on cpu"可见） |
| 主图命名空间 | `/encoder_curve/vit_model/**` —— **Vision Transformer 编码器**：`embeddings/patch_embeddings/projection/Conv`、`embeddings/{Add,Concat,Mul,Equal,Expand,ConstantOfShape,Slice,Transpose,Where}`、`encoder/layer.N/attention/{MatMul,Gemm,Add,...}`（含 `layer.0` 起多层） |
| 可见算子集 | `Conv`、`MatMul`、`Gemm`、`Add`、`Mul`、`Concat`、`Gather`、`Cast`、`Clip`、`Reshape`、`Transpose`、`Shape`、`Slice`、`Expand`、`Equal`、`Where`、`ConstantOfShape`、`Sigmoid/Relu`（词表范围内） |
| 参数量级 | 58 MB / 2（fp16）≈ 2,900 万参数级（推断，未解析张量形状） |

> 设计解读：名为 `encoder_curve`，配合 `[1,3,224,224]` 输入与 `[1,3,33,33,33]` 输出，可判定为"**图像 → 3D LUT（色彩曲线场）**"的回归模型，而非分类/风格标签；这也是"选一张参考图即得风格"的产品基础。

### 10.7 LUT 相关原生能力

| 能力 | 实现 | 备注 |
|---|---|---|
| `mergeCubeFiles(String base, String in, String out)` | `libcube_merge.so`（JNI，`LlcApplication.java:1133`） | 返回 0 = 成功；三方 LUT 合并（基色 + 生成 look） |
| `convertToCube(Bitmap, String, String, int,int,int,int)` | `libllc.so` | 从位图生成 cube（可能用于"从图片提取 LUT"的另一入口） |
| PSL1 装载 | `libtechorfilter.so` 的 `setPhotoStyleLUT` | 见 8.5 |
| LUT 应用 | `ImageFilter.nativeCnv2*` 的 LUT 参数位 | 见 8.2 |

### 10.8 移植评估（LUT/AI 部分）

| 子能力 | 可复用度 | 建议 |
|---|---|---|
| `.cube` 解析/写出、双 LUT 混合、`#LUMIXPHOTOSTYLE` 标记 | **100% 可复刻**（纯文本 + 浮点） | 直接用 ArkTS 实现，注意行序 RGB |
| Magic LUT 前后处理（224×224、CHW、/255；33³ 输出写成 cube） | **100% 可复刻** | 与推理后端解耦，先落地"模型 IO 适配层" |
| `mergeCubeFiles` | 需重写（简单 3D 查表合成，可按 .cube 逐节点插值实现） | 先用纯软件实现，性能可接受（33³=35,937 次） |
| 相机 LUT 下发（prepare/send/abort） | **可直接复用协议** | 注意 `bufsize` 由相机返回、`transID` 必带、失败必须 abort |
| 社区 LUT API | 需商务/服务端确认凭据 | 不建议硬编码 `api-key: 111` |
| ViT 模型推理 | **需模型转换或自编译 ORT** | 方案 A：转 `.om` 走 NNRt（`@ohos.ai.neuralNetworkRuntime`），需验证 MatMul/Gemm/Conv/Cast/Where 等算子覆盖与 fp16 支持；方案 B：为 OHOS 交叉编译 onnxruntime（社区有移植，需自行维护）；方案 C：云端推理（牺牲离线） |
| PSL1（机型风格 LUT） | 二进制可原样复用 | 但依赖 `libtechorfilter` 的 LUT 语义（若是 RGBA half 的 33³ 网格，可在自研引擎中按同样布局解析） |


---

## 11. 数据持久化

### 11.1 Room 数据库（v9，8 次迁移）

- 数据库名 `lumixlab_db`；`AppDatabase extends RoomDatabase`（混淆为 `D1.Z`）；**schema 版本 9**，迁移 `a(1→2) … h(8→9)`（`database/AppDatabase.java:67-112`）。
- identity hash `a54ca850fe90073b69baa28b3a22f2c2`（`AppDatabase_Impl.java:96`），共 **11 张业务表 + `room_master_table`**。
- **没有任何 `CREATE INDEX`，也没有 `FOREIGN KEY`**（全项目仅 WorkManager 自己的表有索引）。
- **没有 `@TypeConverter`**：所有 DAO 的 converter 列表都是 `Collections.emptyList()`（`AppDatabase_Impl.java:118-129`）；`edit_hsl_json`、`edit_crop_bean`、`edit_sq_points`、`scale_trans_info`、`color_picker_hsl_json` 都是 TEXT，序列化在 DAO/业务层手工完成（Gson）。

| 表 | 列数 | 关键内容 |
|---|---|---|
| `camera_info` | 13 | 已配对相机：SSID/密码/设备名/索引/位置/时间同步/自动发送/SD 槽/BLE 地址/公网 BT 地址/机型/目标子类型 |
| `gallery_info` | 21 | 本地媒体索引：`file_id`(MediaStore)、时间戳、类型、编辑 id、路径、大小、评分、方向、连拍信息、Hires、合成、临时插入 |
| `edit_info` | **89** | 编辑参数总表（见 11.2） |
| `lut_info` | 14 | LUT：名称/序号/下载时间/路径/code/PhotoStyle id/来源/adjustment/颗粒/色噪/锐化/降噪/cube 版本 |
| `frame_info` | **56** | 相框模板：18 个显示开关、颜色/字体/边框/模糊、缩略图 BLOB、缩放变换 JSON |
| `update_info` | **36** | 固件与软件更新：设备/版本/URL/下载路径/状态 + 11 种语言的 EULA 与更新历史链接 |
| `push_info` | 16 | 推送缓存（标题/正文/类型/链接/有效期/固件字段/状态/投递 id） |
| `camera_record_info` | 5 | 相机连接历史（限 100 条） |
| `lens_record_info` | 5 | 镜头连接历史（限 100 条） |
| `community_info` | 3 | 社区条目（code / praise）——**DAO 不可达（无 accessor、无调用点），历史遗留表** |
| `color_picker_info` | 3 | 取色器状态：`edit_id` 为主键（非自增），`INSERT OR REPLACE` |

迁移内容（`a5/a…h.java`）：

| 版本 | 内容 |
|---|---|
| 1→2 | 新建 `push_info`、`camera_record_info`、`lens_record_info`、`update_info` |
| 2→3 | `update_info.update_required_version` |
| 3→4 | 重建 `gallery_info`（`file_size` NULL→0） |
| 4→5 | 新建 `frame_info` |
| 5→6 | `frame_info.scale_trans_info` |
| 6→7 | 新建 `color_picker_info`；为 `gallery_info`/`edit_info`/`camera_info`/`lut_info` 增加大量列，**并做数据修正**（如 `UPDATE edit_info SET edit_whitebalance=5500 WHERE edit_whitebalance=5000 AND edit_status=0`，`a5/f.java:22`） |
| 7→8 | `gallery_info.file_modify_time` + `edit_info` 的 `edit_sq_*`（变速）4 列 |
| 8→9 | `lut_info.lut_cube_ver` + 分离色调颜色 `-1 → 0` 的修正 |

### 11.2 `edit_info` 的 88 列分组（对应 8.4 的参数模型）

| 组 | 列 |
|---|---|
| 标识 | `edit_id`(PK)、`edit_status`、`edit_batch_id`、`file_path`、`edit_is_used_raw_sdk`、`edit_photostyle_id`、`edit_photostyle_raw_index` |
| LUT | `edit_lut_id`、`edit_lut_intensity`、`edit_lut2_id`、`edit_lut2_intensity`、`edit_lut_adjustment` |
| 裁剪/几何 | `edit_ratio`、`edit_crop_bean`、`edit_true_width/height`、`edit_enlarge`、`edit_crop_frame`、`edit_crop_offset`、`edit_rotate`、`edit_portrait`、`edit_file_start`、`edit_crop_start`、`edit_crop_length_width` |
| 视频剪辑/变速 | `edit_cut_start`、`edit_cut_end`、`edit_sq_type`、`edit_sq_speed`、`edit_sq_points`、`edit_sq_temp` |
| 影调 | `edit_exposure`、`edit_brightness`、`edit_contrast`、`edit_highlight`、`edit_shadow`、`edit_saturation`、`edit_whitebalance`、`edit_white_balance_tint` |
| HSL（8 色×3） | `edit_hsl_{red,orange,yellow,green,deep_sky_blue,blue,purple,orchid}_{hue,saturation,luminance}` + `edit_hsl_color`、`edit_hsl_json` |
| 分离色调（3 段×3） | `edit_splite_{shadow,middle,highlight}_{hue,color,luminance}` + `edit_splite_type` |
| 曲线 | `edit_tone_color`、`edit_tone_point_{white,red,green,blue}` |
| 效果 | `edit_sharp`、`edit_granular`、`edit_gaussianBlur`、`edit_vignette`、`edit_noise_c`、`edit_noise_c_flag`、`edit_natural_sat`、`edit_wt_level`、`edit_bk_level`、`edit_rpf_level` |

> 移植建议：宽表在鸿蒙侧会持续带来迁移成本。建议拆为 `edit_param`（JSON 参数体，1 行 1 条编辑）+ `edit_lut`（关联）+ 少量索引列（`edit_status`、`file_path`），把 88 列压到 10 列以内；历史数据可用一次性迁移脚本转换。

### 11.3 键值存储：**AndroidX DataStore Preferences（不是 SharedPreferences）**

- `PreferenceDataStoreFactory.create(...)` 创建的 store 名为 **`lumixlab`**（`LlcApplication.java:1231-1252`），由 `util/S` 封装。
- `util/S` 提供类型化读写：`S.f/g`(String)、`S.c`(Integer)、`S.e`(Long)、`S.a`(Boolean)、`S.d(Class,key)`(Gson 反序列化对象)、`S.h(value,key)`(写入)。
- **应用层没有任何 `getSharedPreferences`**（只有 Adobe/GSM 等三方库在用）。
- 键清单（37 个，摘录）：`key_last_version_code`（对比 22 判定升级）、`first_time_tips_after_update`、`DEVICE_MP4LITE_SUPPORT_STATE`、`DEVICE_HAS_MAGIC_LUT`、`DATA_STORE_UUID`（相机认证用）、`DATA_STORE_CONNECTED_CAMERA_INFO_KEY`、`DATA_STORE_CONNECTED_LENS_INFO_KEY`、`DATA_STORE_LICENSE_AGREEMENT_VERSION_CODE_KEY`、`DATA_STORE_PRIVACY_NOTICE_VERSION_CODE_KEY`、`DATA_STORE_RAW_JPEG_SAVE_FORMAT_TYPE_KEY`、`DATA_STORE_RAW_HEIF_SAVE_FORMAT_TYPE_KEY`、`DATA_STORE_LIVE_YOUTUBE_SETTING_TITLE_KEY`、`DATA_STORE_USER_SEGMENTS_*`、`DATA_STORE_GALLERY_FILTER`、`DATA_STORE_REVIEW_FLOW_*` 等。

### 11.4 文件与缓存

| 路径 | 用途 |
|---|---|
| `getExternalCacheDir()/lut_temp` | 生成的 Magic LUT（`lut_output_*.cube`）与临时合并 cube；启动清理 |
| `getExternalCacheDir()/share_media` | 分享用临时文件；启动清理 |
| `getExternalFilesDir("lut_bitmap")` | LUT 缩略图/位图 |
| `getExternalFilesDir(DIRECTORY_MOVIES)` | 导出的视频 |
| `DCIM/LUMIXLab`（MediaStore） | 导出的照片（`<name>_lab.hif` / `<name>_lab`） |
| Glide DiskCache `lumixlab` | 图片缓存 |

---

## 12. 十个"复杂点"总结（复刻时最容易踩坑的地方）

1. **三条异构相机通道共存**：BLE（控制/凭据/状态）+ HTTPS REST（数据面）+ USB PTP（有线）。三套状态（`EnumC0627g` BLE / `EnumC0641n` Wi-Fi / `EnumC3088e` PTP）在 ViewModel 里交叉判断。
2. **证书 TOFU**：相机自签证书，配对时从 BLE 取 `CER_FINGER_PRINT`/`HTTPS_CA_CONTENTS`，运行时用 SHA-256 指纹做主机名校验（`h6/d.java`），配合"信任一切"的 `X509TrustManager`（`h6/f.java`）实现"无感安全"。
3. **liveview 二进制协议**：约 120 字节定长头 + 5 组变长数组（对焦框/图标/附加/设置/PhotoStyle 明细），`dataflag`/`exheadersize`/`exheadertype` 支持扩展，且存在 `K5/C0657v0` 与 `K5/Q0` 两代解析器。
4. **能力集驱动 UI**：28 个能力字段 `{item, subitem[]}` + 20 多个 `*_list.json` 文案/机型表（`videoquality_list.json` 61.8 KB），遥控页是"数据生成"而非硬编码。
5. **RAW 显影 = 一次 45 参数 JNI 调用**（`ImageFilter.nativeCnv2`），参数位置即协议，内核在 `libtechorfilter.so` 内以 **Vulkan compute**（36 个 SPIR-V）实现。
6. **LUT 四层并存**：`.cube`（33³ 文本）、`.tone`（1D 曲线）、`PSL1`（88 字节头 + half 数据，机型专属）、以及"模型直接输出 33³ LUT"；再叠加双 LUT 混合、`cube_merge` 合并、`#LUMIXPHOTOSTYLE` 标记。
7. **端侧 ViT 生成 LUT**：`[1,3,224,224]` 输入（CHW、/255）→ `[1,3,33,33,33]` 输出 → 写成 `.cube` → 与风格→V-Log cube 合并。
8. **两套媒体栈**：预览是 `MediaExtractor+MediaCodec+libyuv+libtechorfilter` 的逐帧管线；导出是 8 节点 `MediaCodec(Surface)+MediaMuxer` 图。**FFmpeg 只用于取帧/元数据**（`FFmpegMediaMetadataRetriever`），不参与编解码。
9. **88 列宽的编辑参数表 + 8 次迁移**（含数据修正），且键值层用的是 DataStore 而非 SharedPreferences。
10. **布尔量拼状态机 + 全局单例 + 全局锁**：`LlcApplication` 约 120 个可变字段；60+ 处 `synchronized (G0.class)`（`G0` 只是个空壳锁类）；40+ 个自定义广播驱动 UI；最后一屏销毁即 `killAppProcess()`。

---

## 13. HarmonyOS（NEXT）移植方案

### 13.1 能力映射表

| Android 侧 | 现用法 | HarmonyOS 对应 | 风险/说明 |
|---|---|---|---|
| BLE GATT 中心 | `BluetoothGatt`/`BluetoothLeScanner` | `@ohos.bluetooth.ble`（`startBLEScan`/`createGattClientDevice`/`readCharacteristicValue`/`writeCharacteristicValue`/`setCharacteristicChangeNotification`） | 能力齐全；注意 MTU 与写类型，长包需分片 |
| Wi-Fi 定向连接 | `WifiNetworkSpecifier` + `bindProcessToNetwork`（`I5/c.java`） | `@ohos.wifiManager` candidate config（`addCandidateConfig`/`connectToCandidateConfig`）+ 网络绑定 | 部分接口需 ACL/系统权限；需真机验证"仅本应用走相机热点" |
| HTTPS + 证书固定 | OkHttp + 自定义 TrustManager/HostnameVerifier | `@ohos.net.http`（`caPath` 信任锚）或 `@ohos.net.socket` TLSSocket | 推荐把 BLE 下发的 `HTTPS_CA_CONTENTS` 落盘为唯一 CA（安全的等价实现） |
| REST/JSON | Retrofit + Gson | `@ohos.net.http`/`rcp` + `JSON.parse` | 端点与 DTO 可直接复用（3.3 节） |
| 流式下载 | OkHttp `@Streaming` | `requestInStream` | 原图/缩略图/固件包需流式落盘 |
| 本地库 | Room（11 表 / v9） | `@ohos.data.relationalStore` | 支持事务/索引/加密；需自写迁移 |
| 键值 | DataStore Preferences | `@ohos.data.preferences` | 键名可直接沿用 |
| 图片解码/编码 | `BitmapFactory`、libheif(仅解码)、MediaCodec HEIF | `@ohos.multimedia.image`（`ImageSource`/`PixelMap`/`ImagePacker`） | HEIF 与 10bit/HDR 需按设备验证 |
| RAW 解码 | techOR + libllc（RW2） | 无系统能力 | **必须自研或移植 libraw（NAPI）** |
| 图像显影 | techOR（Vulkan compute）+ GPUImage(GLES) | Vulkan/GLES（C++ + NAPI）、`effectKit`（基础滤镜） | 36 个 SPIR-V 可复用（若设备支持 Vulkan compute 且能反推 uniform） |
| 视频预览/导出 | MediaExtractor/Codec/Muxer + libyuv | `@ohos.multimedia.avcodec`（AVCodec）+ `AVMuxer` + `@ohos.multimedia.media` | Surface 输入编码、节点图调度需自建 |
| 视频播放 | ExoPlayer（仅播放） | `@ohos.multimedia.avplayer` | 不支持 RTMP/RTSP（本场景也无需） |
| 端侧 AI | ORT + `.ort`（ViT） | `@ohos.ai.neuralNetworkRuntime`（需 `.om`）或自编译 ORT | 模型转换 + 精度回归是主要风险 |
| 后台任务 | 5 个 Service（前台/绑定/FCM） | `@ohos.resourceschedule.backgroundTaskManager`（`bluetoothInteraction`/`wifiInteraction`/`dataTransfer`/`location`） | 需 `KEEP_BACKGROUND_RUNNING` 并申请类型 |
| 推送 | FCM | Push Kit | 需华为开发者账号 |
| 分析 | Adobe AEP（6 个 Extension） | HUAWEI Analytics / 自建 | AEP 无 OHOS SDK |
| Google 登录 / YouTube | `GoogleSignIn` + YouTube API（6,769 类） | 无 | **建议直播间创建下沉到云端** |
| 分享 | FileProvider + ACTION_SEND | `systemShare` / `startAbility(sendData)` | — |
| 进程模型 | "最后一屏退出即 kill 进程" | `UIAbility` 生命周期 + 长时任务 | 不要照搬 kill 逻辑 |

### 13.2 推荐工程结构

```
entry/                     # HAP：UIAbility + ArkUI 页面
  ets/pages/               # 相机 / 图库 / LUT 三大 Tab + 遥控 / 编辑 / 直播 / 设置
  ets/components/          # 参数转盘、取景叠加层、曲线控件、色轮、裁剪框
  ets/viewmodel/           # CameraSessionVM / GalleryVM / EditVM / LutVM
  ets/protocol/ble|rest|liveview   # UUID、端点、DTO、二进制解析
feature_camera/  (HSP)     # 连接 / 遥控 / 直播
feature_edit/    (HSP)     # 编辑 UI + 渲染调度
feature_lut/     (HSP)     # LUT 管理 + 社区 + Magic LUT
core_native/     (HSP+NAPI) # RAW/色彩引擎/LUT/Vulkan/编解码
core_data/       (HSP)     # relationalStore DAO + 仓储 + 迁移
```

### 13.3 分阶段落地

| 阶段 | 目标 | 关键交付 |
|---|---|---|
| P0（1–2 周） | 连得上、看得见 | BLE 配对 + Wi-Fi 加入 + 证书固定 + `/auth` + `remote/get-setting` |
| P1（3–4 周） | 遥控可用 | liveview 解析（两代）+ 参数写入 + 拍照/录像 + 状态叠加 |
| P2（3–4 周） | 图库与传输 | 分页/缩略图/原图 Range/连拍/自动传输 + 长时任务 |
| P3（4–6 周） | LUT 工作台 | `.cube`/PSL1、双 LUT、`lut/send` 三段式、社区下载、Magic LUT 前后处理 |
| P4（6–10 周） | 图像编辑 | 解码 + 参数模型 + 渲染 + 导出（RAW 与滤镜选型先行） |
| P5（4–6 周） | 视频编辑 | 剪辑/变速/转码（复刻 9.5 的数学） |
| P6（3–4 周） | AI 推理 | 模型转换 + NNRt + 精度对齐（或云端替代） |

### 13.4 三个必须先决策的选型

1. **RAW 显影**：A) 商务获取 techOR 的 OHOS 版 SDK（最快、效果一致）；B) 自研（libraw + 自建管线 + 复用 SPIR-V，3–4 人月）；C) 云端显影（与离线定位冲突）。
2. **Magic LUT 推理**：转 `.om` 走 NNRt（需验证 ViT 算子覆盖与 fp16）、或自编译 ORT for OHOS、或云端推理。
3. **直播**：服务端建直播间 + 端侧转发 ingestion URL；保留手填 RTMP/RTMPS 模式。

### 13.5 可直接复用的资产

| 资产 | 说明 |
|---|---|
| 48 条 BLE UUID↔语义（3.2） | 常量表 |
| 35+ REST 端点 + DTO 字段（3.3） | 路径常量 + DTO |
| liveview 头部字段表（4.2） | `DataView` 解析器 |
| `L` 命令词汇表（4.3） | 枚举 |
| 28 个能力键 + 20 个 `*_list.json` | 资源/云端下发 |
| `PSL1` 格式（8.5）+ `photoStyleLUT/*.bin` | 二进制原样复用 |
| `.cube` / `.tone` 解析 + Magic LUT 前后处理（10.5） | 纯算法，直接复刻 |
| 变速曲线数学（9.5） | 纯算法，直接复刻 |
| 11 张表 schema（11.1） | relationalStore DDL |

### 13.6 不建议照搬

| 现设计 | 问题 | 建议 |
|---|---|---|
| `LlcApplication` 上帝对象（~120 字段） | 隐式耦合、不可测、进程重建即丢 | AppStorage（UI 态）+ 仓储（持久态）+ Session（连接态） |
| 40+ 广播驱动 UI | 时序不可控 | `emitter` + 显式状态机 |
| 45 参数 JNI 单函数 | 契约脆弱 | 结构体/请求对象 + 字段校验 |
| 88 列宽表 + 8 次迁移 | 维护成本 | JSON 参数体 + 索引列 |
| 硬编码 Basic 凭据 / 信任所有证书 | 安全风险 | 短期凭据 + 证书固定 |
| `killAppProcess()` on last activity | 破坏系统生命周期 | 交由长时任务与系统调度 |
| 100 线程固定池 | 资源浪费 | TaskPool + 有界队列 |

---

## 14. 附录

### 14.1 关键类速查

| 功能 | 类 |
|---|---|
| Application / 全局状态 | `com.panasonic.jp.lumixlab.LlcApplication` |
| BLE 中心 | `H5.j`（原 `LLCBleCentral`）、`H5.d`（GATT 回调）、`H5.a`（UUID 表）、`H5.z`（业务状态机） |
| Wi-Fi 连接 | `I5.c`、`I5.e`、`Z5/C3984s2`、`Z5/C4024w2` |
| 相机 REST | `h6.InterfaceC2329a`（端点）、`h6.h`（客户端/错误）、`h6.C2330b`（BaseUrl）、`h6.d/f/g`（TLS） |
| USB PTP | `p6.C3096m`、`p6.C3089f`、`p6.C3090g`、`q6.*`、`Y5.*` |
| 相机模型 / liveview | `K5.C0643o`、`K5.C0636k0`、`K5.C0657v0`、`K5.Q0`、`K5.C0620c0` |
| 遥控页 | `RemoteShootingActivity`、`RemotePhotostyleActivity`、`ShutterRemoteControlFragment` |
| 图库/传输 | `CameraGalleryActivity`、`GalleryContainerFragment`、`LlcService`、`ForegroundService` |
| 图像引擎 | `com.techor.techorfilter.ImageFilter`、`util.p1`（原 `RawEditManager`）、`bean/RawProcessingConfigBean`、`util/C1517b0`（LUT/导出）、`util/C1566x`（Magic LUT 前后处理）、`G5/CallableC2193k`（推理） |
| 视频引擎 | `util/videoEdit/YUVVideoPackage/*`、`e6.e` + `j6.*`（导出图）、`util/Q0`、`l6.*`（变速） |
| 直播 | `util/D1`、`controller/fragment/LiveDelivery*` |
| 数据库 | `database/AppDatabase`、`database/entity/*`、`a5/*`（迁移） |

### 14.2 资源清单

| 路径 | 数量 | 说明 |
|---|---|---|
| `assets/photoStyleLUT/<CAM>/*.bin` | 426 | 8 机型；`lut_<style>.bin`（4 KB，1D 2048 点 half）+ `_high/_low.bin`（211 KB，33³×3×half） |
| `assets/models/PI_3D_LUT_v1.0.0_model_B_fp16.ort` | 1 | 56.8 MB，fp16 ViT，输入 `image`[1,3,224,224]，输出 33³ LUT |
| `assets/models/mergeLut/*.cube` | 13 | 各 PhotoStyle → V-Log |
| `assets/LUTFile/*.cube`、`*.tone` | 5 | identity / gamma corrected / film_blue + 2 条 1D 曲线 |
| `assets/*.cube`（根） | 5 | 预置 LUT（Teal Flat-S 等） |
| `assets/shaders/glsl/computeheadless/*.spv` | 36 | Vulkan compute（预处理/降噪×5/锐化/镜头/YCC/色彩转换/后端） |
| `assets/*_list.json` | 20+ | 能力值与文案映射 |
| `assets/tips_*.mp4`、`appguide*.mp4` | 11 | 引导视频 |
| `assets/{privacy-notice,license-agreement,license-oss,fup-warning-notice,usb-supported-cameras}` | 40+ | 多语言 HTML |

### 14.3 待真机验证的问题

1. liveview 头部 `exflag/exflag2/exflag3/exflag3_vh` 的位含义。
2. `K5/C0657v0` 与 `K5/Q0` 的选择条件（版本？机型？固件？）。
3. `remote/camcmd` 请求体的确切字段名（代码拼装 JSON，未找到统一 DTO）。
4. `media/gallery/info` 的分页参数（`CommonPagingRequestParamBean` 字段被混淆）。
5. `PSL1` 的 `_high/_low` 与 EV 分段的映射关系（代码未见阈值常量）。
6. `libtechorfilter.so` 的滤镜链算法与 45 个参数的精确语义（需指令级逆向；本机无 Ghidra/IDA）。
7. `mergeCubeFiles` 的合并公式（线性/加权；native 未反编译）。
8. `synchronized (G0.class)` 保护的实际语句（JADX 输出为空块）。
9. `DeepLinkRouterActivity` 的 `lumixlab://…/lutdownload/…` 分支细节（未还原）。
10. `NEARBY_WIFI_DEVICES` 是否真的必需（声明了但从未运行时申请）。

### 14.4 复现命令

```powershell
# 打包事实
aapt2 dump badging  "Panasonic LUMIX Lab_3.1.0.apk"
aapt2 dump xmltree --file AndroidManifest.xml "Panasonic LUMIX Lab_3.1.0.apk" > manifest.txt
aapt2 dump resources "Panasonic LUMIX Lab_3.1.0.apk" > resources.txt
apksigner verify --print-certs "Panasonic LUMIX Lab_3.1.0.apk"

# 反编译（JADX 1.5.1；先普通，再对失败方法补 --show-bad-code）
jadx -d _decompiled  --no-res -j 16 "Panasonic LUMIX Lab_3.1.0.apk"
jadx -d _decompiled2 --no-res --show-bad-code -j 16 "Panasonic LUMIX Lab_3.1.0.apk"

# 原生库 JNI 符号（libllc / libtechorfilter / libcube_merge）
#   提取 lib/arm64-v8a/*.so 后扫描 "Java_" 前缀字符串

# 模型 IO（.ort）
#   读 assets/models/*.ort，按 [\x20-\x7E]{4,} 聚合 "/encoder_curve/vit_model/**"
```

