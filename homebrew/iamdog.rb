cask "iamdog" do
  version "0.1.5"
  sha256 :no_check  # 或者计算实际的 SHA256 值

  url "https://github.com/HayaKus/IamDog/releases/download/v#{version}/lingxi-#{version}.dmg"
  name "IamDog"
  name "灵析"
  desc "具备屏幕感知能力的桌面AI助手"
  homepage "https://github.com/HayaKus/IamDog"

  livecheck do
    url "https://raw.githubusercontent.com/HayaKus/IamDog/master/version.json"
    strategy :json do |json|
      json["version"]
    end
  end

  app "灵析.app"

  # 使用 zap 来完全清理应用数据（可选）
  zap trash: [
    "~/Library/Application Support/灵析",
    "~/Library/Application Support/lingxi",
    "~/Library/Preferences/com.alibaba.lingxi.plist",
    "~/Library/Preferences/com.iamdog.app.plist",
    "~/Library/Logs/灵析",
    "~/Library/Saved Application State/com.alibaba.lingxi.savedState",
    "~/Library/Saved Application State/com.iamdog.app.savedState",
  ]

  # 安装后的提示信息
  caveats <<~EOS
    欢迎使用 IamDog (灵析) - 具备屏幕感知能力的桌面AI助手

    首次启动应用时，如果遇到"已损坏"的提示，请执行：
      xattr -cr /Applications/灵析.app

    或者在系统设置中允许运行：
      系统设置 -> 隐私与安全性 -> 允许从以下位置下载的App

    更多信息：https://github.com/HayaKus/IamDog
  EOS
end
