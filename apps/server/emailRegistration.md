# Lumo 邮箱注册部署

在 Lumo 的阿里云账号开通 DirectMail。控制台添加 `lumoai.pro`，按控制台给出的值配置并验证 SPF、DKIM 和 MX。已有 SPF 记录时将授权项合并到同一条记录。核对 MX 配置与域名现有收信服务。验证通过后创建触发邮件发件地址 `verify@lumoai.pro`，设置独立 SMTP 密码。SMTP 主机以开通地区的控制台为准，Lumo 使用 465 端口和隐式 TLS。

在正式创作服务的运行环境配置以下变量。

| 变量 | 值 |
| --- | --- |
| `LUMO_EMAIL_REGISTRATION_REQUIRED` | `1` 启用邮箱验证 |
| `LUMO_REGISTRATION_REDIS_URL` | 创作服务可访问的 Redis 连接 URL |
| `LUMO_REGISTRATION_CODE_SECRET` | 用 `openssl rand -base64 32` 生成的随机密钥，多实例使用同一个值 |
| `LUMO_DIRECTMAIL_SMTP_HOST` | DirectMail 控制台提供的 SMTP 主机 |
| `LUMO_DIRECTMAIL_SMTP_USER` | `verify@lumoai.pro` |
| `LUMO_DIRECTMAIL_SMTP_PASSWORD` | DirectMail 发信地址的 SMTP 密码 |

变量和凭据配置在服务端。使用仓库的 Docker Compose 部署时，从部署环境或现有的密钥注入流程提供这些变量，Compose 会将它们传进 Lumo 容器。部署时让正式创作服务和桌面客户端使用同一版邮箱注册接口。现有安装缺省兼容旧注册，配置 `1` 后由服务器强制要求验证码。后台「允许注册」开关继续控制是否允许自助注册。

验证码有效期为 5 分钟，同一邮箱发送间隔为 60 秒。默认每邮箱每小时最多发送 5 次，整站每小时最多发送 120 次，一个验证码最多尝试 5 次且只能成功使用一次。多实例使用同一个 Redis 和验码密钥，使用 Redis 6.0 或更新版本，并避免验证码和配额键被淘汰。SMTP 发送失败也计入发送额度。

上线前用验收邮箱检查收信、重发倒计时、错误或过期的验证码、注册后自动登录和已有账号登录。

密码找回复用上述发信和 Redis 配置，使用独立的重置验证码。重设成功后旧会话失效，用户使用新密码重新登录。自助找回需要账号有已验证的邮箱记录。此前未保存该记录的账号由管理员核验身份后协助重设。
