# 小白下厨 Android APK 正式出包步骤

这份文档基于当前项目实际配置编写：

- App 名：`小白下厨`
- App ID：`com.kitchenassistant.xiaobaixiachuu`
- Android 工程目录：`android/`
- Web 构建目录：`dist/`
- 安卓同步命令：`npm run android:sync`
- 打开 Android Studio 命令：`npm run android:open`

## 1. 出包前先确认的 4 件事

1. 已安装 Android Studio，并完成 Android SDK 初始化。
2. 已安装 JDK 17。
3. 后端已经部署到一个手机可访问的地址。
4. 这个地址最好是 `HTTPS`，正式发布时不要继续用本机 `localhost`。

## 2. 第一次正式出包

### 第一步：准备生产环境接口地址

安卓包里的前端不会直接运行本地 Node 后端，所以要先给前端一个线上 API 地址。

在项目根目录 `E:\厨房助手` 打开 PowerShell，执行：

```powershell
$env:VITE_API_BASE_URL='https://你的后端域名'
```

示例：

```powershell
$env:VITE_API_BASE_URL='https://api.your-domain.com'
```

注意：

- 这里填的是后端服务地址，不是前端网页地址。
- 地址末尾不要加 `/api`，代码会自己拼接。

### 第二步：构建前端并同步到安卓工程

继续在项目根目录执行：

```powershell
npm run android:sync
```

这一步会做三件事：

1. 重新构建前端页面
2. 把前端资源复制到 `android/app/src/main/assets/public/`
3. 同步 Capacitor Android 工程

如果这一步报错，先不要继续打开 Android Studio，先把报错解决。

### 第三步：打开 Android Studio

执行：

```powershell
npm run android:open
```

Android Studio 会打开当前项目的安卓工程。

### 第四步：等待 Gradle 同步完成

第一次打开时，Android Studio 往往会做这些事情：

- 下载 Gradle 依赖
- 检查 Android SDK
- 同步工程

你需要等右下角的同步完成，不要在红字报错状态下直接出包。

### 第五步：确认版本号

当前版本配置在：

- [build.gradle](E:/厨房助手/android/app/build.gradle)

你会看到：

```gradle
versionCode 1
versionName "1.0"
```

正式发布前建议这样处理：

- `versionCode`：每发一个新版本就加 1
- `versionName`：展示给用户看的版本号，例如 `1.0.0`

例如下一版可以改成：

```gradle
versionCode 2
versionName "1.0.1"
```

### 第六步：生成签名密钥

在 Android Studio 顶部菜单执行：

`Build > Generate Signed Bundle / APK...`

然后：

1. 选择 `APK`
2. 点击 `Next`
3. 在 `Key store path` 里点 `Create new...`

建议这样填写：

- Key store path：放到你自己安全保存的位置，不要放临时目录
- Password：设置一个强密码
- Key alias：例如 `xiaobai-kitchen`
- Key password：可以和 keystore 密码一致
- Validity：至少 `25` 年
- Certificate 信息：按实际情况填写

非常重要：

- `keystore` 文件一定要备份
- 密码和 alias 一定要保存好
- 以后更新同一个 App，必须使用同一套签名

### 第七步：生成正式 APK

继续在 Android Studio 的签名向导里：

1. 选择刚刚创建好的 keystore
2. 选择 `release`
3. 勾选 `V1` 和 `V2` 签名
4. 点击 `Finish`

Android Studio 会开始打包。

### 第八步：找到 APK 文件

正式 APK 默认通常会出现在：

- `E:\厨房助手\android\app\build\outputs\apk\release\app-release.apk`

如果你是从 Android Studio 菜单生成的，打包完成后右下角通常也会直接提供 `locate` 按钮。

## 3. 以后每次更新版本怎么出包

以后每次出新版本，按这个顺序走：

1. 修改前端或后端逻辑
2. 确认线上后端已更新
3. 设置生产 API 地址
4. 执行 `npm run android:sync`
5. 打开 Android Studio
6. 把 `versionCode` 加 1
7. 视需要更新 `versionName`
8. 使用原来的 keystore 再次生成 Signed APK

最常用命令：

```powershell
$env:VITE_API_BASE_URL='https://你的后端域名'
npm run android:sync
npm run android:open
```

## 4. 如果你只是想先装到自己手机测试

如果不是正式发布，只是想先在手机或模拟器试跑：

1. 仍然先设置 `VITE_API_BASE_URL`
2. 执行 `npm run android:sync`
3. 打开 Android Studio
4. 直接点顶部绿色运行按钮
5. 选择模拟器或已连接真机

这种方式跑起来最快，但它不等于“正式发布包”。

## 5. 正式发布前建议检查

1. 后端是否使用 `HTTPS`
2. DeepSeek key 是否仍然只保存在服务端，不在前端泄露
3. `versionCode` 是否比上一版更大
4. App 是否能在真机上正常访问 API
5. 首屏、视频播放、AI 问答、历史记录是否都正常
6. 是否保存好了 keystore 和密码

## 6. 常见问题

### 1. App 打开了，但请求接口失败

通常是以下原因：

- `VITE_API_BASE_URL` 没配对
- 后端没部署
- 手机访问不到后端地址
- 后端没开公网访问
- 后端证书或跨域配置有问题

### 2. 我已经改了前端代码，但 APK 里还是旧页面

通常是因为你没重新同步。

重新执行：

```powershell
npm run android:sync
```

然后再去 Android Studio 出包。

### 3. 丢了 keystore 怎么办

如果是同一个应用已经发布过，丢失 keystore 会非常麻烦，后续更新也会受影响。

所以请务必：

- 备份 keystore
- 备份密码
- 备份 alias

## 7. 你这个项目当前最推荐的正式出包流程

最简流程如下：

```powershell
cd E:\厨房助手
$env:VITE_API_BASE_URL='https://你的后端域名'
npm run android:sync
npm run android:open
```

然后在 Android Studio 中：

1. 等 Gradle 同步完成
2. 检查 `versionCode` 和 `versionName`
3. `Build > Generate Signed Bundle / APK...`
4. 选择 `APK`
5. 选择已有 keystore 或创建新 keystore
6. 选择 `release`
7. 生成 APK
8. 到 `android/app/build/outputs/apk/release/` 取包
