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

    // Ball Badges Color Tokens (1-15, aligned with ball_configs.json "xingpai" theme)
    val Ball1Yellow = Color(0xFFF5C01A)
    val Ball2Blue = Color(0xFF1A4B9C)
    val Ball3Red = Color(0xFFD92525)
    val Ball4Pink = Color(0xFFF45FA4)
    val Ball5Orange = Color(0xFFF27415)
    val Ball6Green = Color(0xFF137B3E)
    val Ball7Maroon = Color(0xFF691D24)
    val Ball8Black = Color(0xFF111111)
    val BallDefault = Color.DarkGray

    // Suit Color Tokens
    val SuitRed = Color(0xFFFF5252)
    val SuitWhite = Color.White
    val SuitJokerSmall = Color(0xFFFFD700)
    val SuitJokerBig = Color(0xFFFF4081)

    // Card Status Badge Tokens
    val StatusPocketed = Color.Yellow
    val StatusClearGold = Color(0xFFFFD700)

    // Game Settlement Color Tokens
    val ScoreDeltaPositiveText = Color(0xFF6EE7B7)
    val ScoreDeltaPositiveBg = Color(0xFF064E3B)
    val ScoreDeltaNegativeText = Color(0xFFFCA5A5)
    val ScoreDeltaNegativeBg = Color(0xFF7F1D1D)

    val CategoryScoredText = Color(0xFF34D399)
    val CategoryScoredBg = Color(0xFF064E3B)
    val CategoryScoredBorder = Color(0xFF059669)
    val CategoryScoredChipText = Color(0xFFA7F3D0)

    val CategoryFreeText = Color(0xFF38BDF8)
    val CategoryFreeBg = Color(0xFF0C4A6E)
    val CategoryFreeBorder = Color(0xFF0284C7)
    val CategoryFreeChipText = Color(0xFFBAE6FD)

    val CategoryRemainingText = Color(0xFFF87171)
    val CategoryRemainingBg = Color(0xFF7F1D1D)
    val CategoryRemainingBorder = Color(0xFFDC2626)
    val CategoryRemainingChipText = Color(0xFFFCA5A5)
    val CategoryRemainingPenaltyText = Color(0xFFF87171)

    fun getBallColor(ballNumber: Int): Color {
        return when (ballNumber) {
            1, 9 -> Ball1Yellow
            2, 10 -> Ball2Blue
            3, 11 -> Ball3Red
            4, 12 -> Ball4Pink
            5, 13 -> Ball5Orange
            6, 14 -> Ball6Green
            7, 15 -> Ball7Maroon
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
