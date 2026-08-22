package com.poolpoker.companion.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

object CompanionColors {
    val PoolDarkGreen = Color(0xFF0F3820)
    val PoolGold = Color(0xFFFFD700)
    val PoolRed = Color(0xFFE53935)
    val CardSurface = Color(0xFF1E1E1E)
    val TextSecondary = Color(0xFFB0BEC5)
}

private val CompanionColorScheme = darkColorScheme(
    primary = CompanionColors.PoolGold,
    onPrimary = Color.Black,
    secondary = CompanionColors.PoolDarkGreen,
    onSecondary = Color.White,
    error = CompanionColors.PoolRed,
    onError = Color.White,
    background = Color.Black,
    onBackground = Color.White,
    surface = CompanionColors.CardSurface,
    onSurface = Color.White
)

@Composable
fun CompanionAppTheme(
    content: @Composable () -> Unit
) {
    MaterialTheme(
        colorScheme = CompanionColorScheme,
        content = content
    )
}
