# 汇率随行 1.0.0

一个中文 Android 汇率查询和换算工具。安装包：[`Huilv-Suixing-v1.0.0.apk`](https://github.com/Ad-free-is-important/currency-companion/releases/download/v1.0.0/Huilv-Suixing-v1.0.0.apk)。

## 安装和使用

1. 在 Android 手机上下载并打开 APK；如果系统询问是否允许当前下载应用安装软件，可仅为该来源允许一次安装。
2. 安装后打开「汇率随行」。需要 Android 8.0 或更高版本，以及更新过的 Android System WebView。
3. 点击左侧货币名称搜索国家、中文货币名或英文代码；上方为持有货币，下方为目标货币。默认美元兑人民币。
4. 输入金额，点中间的互换按钮可切换换算方向。点击星标将目标货币加入自选。
5. 曲线可切换日、周、月、年、五年，点击或拖动可查看时间及报价。
6. 右上角刷新；设置页可关闭自动刷新或调整换算结果的小数位。

## 外观模式

- 设置 → 外观模式：可选择标准模式（浅色）或黑暗模式。
- 主界面、自选、设置、货币搜索、曲线及手机状态栏/导航栏随模式切换。
- 保存选择，重启后继续使用；新安装默认标准模式。

## 数据说明

- 日内及历史行情首先直接从 Yahoo Finance 查询。日曲线使用 5 分钟报价，周曲线使用最近 5 个交易日的 30 分钟报价，月/年为每日收盘，五年为每周收盘。
- 源站行情可能延迟。换算页每 60 秒尝试刷新，不保证数据源每 60 秒产生新价格。界面展示真实报价时间，超过 6 小时会提示可能休市或延迟。
- 没有直接货币对时，可通过同一时间点的美元报价计算交叉汇率，不拼接不同时间点的价格。
- Yahoo 不可用时，回退到 Frankfurter 每日参考汇率。日视图在没有日内行情时明确提示无数据，不生成假曲线。周/月/年/五年可使用 Frankfurter 历史参考数据。
- 自选页统一使用 Frankfurter 每日参考价，逐条显示日期，避免将每日数据标为实时。
- 货币目录内置 166 个可用代码（构建时查询结果），启动时联网更新。各币种的最新行情、五年历史和日内覆盖并不完全相同，曲线显示实际覆盖起止时间。
- 仅供兑换估算，银行、换汇机构和支付平台的买卖价及费用可能不同。
- Yahoo 的公开行情端点没有稳定的第三方 API 服务保证；如果对方改变接口或限制请求，应用会尝试每日参考价回退。

数据源：

- https://finance.yahoo.com/currencies/
- https://help.yahoo.com/kb/SLN2310.html
- https://frankfurter.dev/

## 权限和隐私

仅申请 INTERNET 权限，无账号、广告、定位、通讯录和文件读取权限。金额在本机计算，网络只发送币种及时间范围。偏好和最近查询缓存在应用自己的 WebView 本地存储，设置页可清除行情缓存。Android 云备份已关闭。

## 源码结构

- `assets/`：完整本地中文界面、兑换和图表逻辑、内置货币目录。
- `src/com/adfree/currency/MainActivity.java`：Android Activity、WebView 和异步 HTTPS 桥接。界面由应用内资源提供，不依赖远程页面。
- `res/`：系统主题和应用图标。
- `AndroidManifest.xml`：包名 `com.adfree.currency`，minSdk 26，targetSdk 35。
- `signing/`：仅供本地保存签名材料，不包含在此仓库中。
- `build.sh`：不依赖 Gradle 的完整构建脚本。

## 本地重新构建

环境：Linux、Java 17、Python 3、Android SDK platform 35 / build-tools 35.0.0、Eclipse ECJ 3.38.0。

```bash
export ANDROID_SDK_ROOT=/absolute/path/to/android-sdk
export ECJ_JAR=/absolute/path/to/ecj-3.38.0.jar
bash build.sh
```

产物位于 `dist/Huilv-Suixing-v1.0.0.apk`。发布更新时增加清单的 `versionCode` 并保留同一签名材料。对外分享应用只需发送 APK，原始源码备份含私有签名材料，请私下保存；本仓库排除了签名材料。

构建工具下载来源：Android SDK 官方仓库以及 Maven Central 的 `org.eclipse.jdt:ecj:3.38.0`。应用不包含第三方 JavaScript 库，不包含任何预置行情密钥。

## 仓库中的签名材料

本仓库排除了原始签名私钥及密码。直接运行构建脚本会在本机生成新签名，生成的 APK 无法覆盖当前已发布签名的安装。要保留覆盖升级能力，请在本地恢复原有 `signing/`，不要提交它。原有 APK 保持原始签名。

## 下载与校验

- [下载 汇率随行 1.0.0 APK](https://github.com/Ad-free-is-important/currency-companion/releases/download/v1.0.0/Huilv-Suixing-v1.0.0.apk)
- [SHA-256 校验值](https://github.com/Ad-free-is-important/currency-companion/releases/download/v1.0.0/SHA256SUMS)

## 授权

此仓库未附加新的开源许可证，授权方式由项目所有者另行决定。
