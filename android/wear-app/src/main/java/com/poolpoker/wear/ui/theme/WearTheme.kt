package com.poolpoker.wear.ui.theme

import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.wear.compose.material3.ColorScheme
import androidx.wear.compose.material3.MaterialTheme
import com.poolpoker.shared.SuitType

object PoolPokerColors {
    // Primary Theme Palette Tokens
    val DarkPoolGreen = Color(0xFF0F3820)
    val PoolGold = Color(0xFFFFD700)
    val PoolRed = Color(0xFFE53935)
    val CardBlack = Color(0xFF1E1E1E)
    val FoulRed = Color(0xFFFF5252)

    // Numpad & Control Action Tokens
    val NumpadSlotBg = Color(0xFF2A2A2A)
    val NumpadConfirmGreen = Color(0xFF43A047)
    val NumpadBackspaceRed = Color(0xFFE53935)

    // Ball Badges Color Tokens (1-15)
    val Ball1Yellow = Color(0xFFFFB300)
    val Ball2Blue = Color(0xFF1E88E5)
    val Ball3Red = Color(0xFFE53935)
    val Ball4Purple = Color(0xFF8E24AA)
    val Ball5Orange = Color(0xFFFB8C00)
    val Ball6Green = Color(0xFF43A047)
    val Ball7Brown = Color(0xFF8D6E63)
    val Ball8Black = Color(0xFF212121)
    val BallDefault = Color.DarkGray

    // Suit Color Tokens
    val SuitRed = Color(0xFFFF5252)
    val SuitWhite = Color.White
    val SuitJokerSmall = Color(0xFFFFD700)
    val SuitJokerBig = Color(0xFFFF4081)

    // Card Status Badge Tokens
    val StatusPocketed = Color.Yellow
    val StatusClearGold = Color(0xFFFFD700)

    fun getBallColor(ballNumber: Int): Color {
        return when (ballNumber) {
            1, 9 -> Ball1Yellow
            2, 10 -> Ball2Blue
            3, 11 -> Ball3Red
            4, 12 -> Ball4Purple
            5, 13 -> Ball5Orange
            6, 14 -> Ball6Green
            7, 15 -> Ball7Brown
            8 -> Ball8Black
            else -> BallDefault
        }
    }

    fun getSuitColor(suitType: SuitType): Color {
        return when (suitType) {
            SuitType.HEART, SuitType.DIAMOND -> SuitRed
            SuitType.SPADE, SuitType.CLUB -> SuitWhite
            SuitType.JOKER_SMALL -> SuitJokerSmall
            SuitType.JOKER_BIG -> SuitJokerBig
        }
    }
}

val PoolPokerWearColorScheme = ColorScheme(
    primary = PoolPokerColors.PoolGold,
    onPrimary = Color.Black,
    secondary = PoolPokerColors.DarkPoolGreen,
    onSecondary = Color.White,
    error = PoolPokerColors.PoolRed,
    onError = Color.White,
    background = Color.Black,
    onBackground = Color.White,
    surfaceContainer = PoolPokerColors.CardBlack,
    onSurface = Color.White
)

@Composable
fun PoolPokerWearTheme(
    content: @Composable () -> Unit
) {
    MaterialTheme(
        colorScheme = PoolPokerWearColorScheme,
        content = content
    )
}
