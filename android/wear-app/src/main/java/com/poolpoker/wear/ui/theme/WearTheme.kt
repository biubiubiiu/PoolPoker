package com.poolpoker.wear.ui.theme

import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.wear.compose.material3.ColorScheme
import androidx.wear.compose.material3.MaterialTheme

val DarkPoolGreen = Color(0xFF0F3820)
val PoolGold = Color(0xFFFFD700)
val PoolRed = Color(0xFFE53935)
val CardBlack = Color(0xFF1E1E1E)

val PoolPokerWearColorScheme = ColorScheme(
    primary = PoolGold,
    onPrimary = Color.Black,
    secondary = DarkPoolGreen,
    onSecondary = Color.White,
    error = PoolRed,
    onError = Color.White,
    background = Color.Black,
    onBackground = Color.White,
    surfaceContainer = CardBlack,
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
