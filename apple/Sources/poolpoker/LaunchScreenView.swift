import SwiftUI

/// SwiftUI 启动页 / 过渡页视图 (LaunchScreenView)
public struct LaunchScreenView: View {
    @State private var isAnimating = false

    public init() {}

    public var body: some View {
        ZStack {
            // 背景渐变色 (暗夜绿色台球桌风格)
            LinearGradient(
                gradient: Gradient(colors: [
                    Color(red: 0.05, green: 0.20, blue: 0.12),
                    Color(red: 0.02, green: 0.10, blue: 0.06)
                ]),
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            .ignoresSafeArea()

            VStack(spacing: 24) {
                Spacer()

                // 主图标 / 台球元素组合
                ZStack {
                    Circle()
                        .fill(
                            RadialGradient(
                                gradient: Gradient(colors: [Color.yellow, Color.orange]),
                                center: .topLeading,
                                startRadius: 5,
                                endRadius: 60
                            )
                        )
                        .frame(width: 100, height: 100)
                        .shadow(color: Color.black.opacity(0.4), radius: 10, x: 0, y: 5)
                        .scaleEffect(isAnimating ? 1.05 : 0.95)
                        .animation(Animation.easeInOut(duration: 1.2).repeatForever(autoreverses: true), value: isAnimating)

                    Text("8")
                        .font(.system(size: 48, weight: .black, design: .rounded))
                        .foregroundColor(.black)
                }

                VStack(spacing: 8) {
                    Text("PoolPoker")
                        .font(.system(size: 36, weight: .bold, design: .rounded))
                        .foregroundColor(.white)

                    Text("球霸扑克 · 实时对战")
                        .font(.system(size: 16, weight: .medium))
                        .foregroundColor(Color.white.opacity(0.7))
                }

                Spacer()

                // 底部加载指示器
                ProgressView()
                    .progressViewStyle(CircularProgressViewStyle(tint: .white))
                    .scaleEffect(1.2)
                    .padding(.bottom, 40)
            }
        }
        .onAppear {
            isAnimating = true
        }
    }
}

struct LaunchScreenView_Previews: PreviewProvider {
    static var previews: some View {
        LaunchScreenView()
    }
}
