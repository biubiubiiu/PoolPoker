package com.poolpoker.wear.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.requiredSize
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.wear.compose.material3.Text
import com.poolpoker.wear.ui.theme.PoolPokerColors

@Composable
fun BilliardBallBadge(
    ballNumber: Int,
    modifier: Modifier = Modifier,
    size: Dp = 32.dp
) {
    val isStriped = ballNumber in 9..15
    val ballColor = PoolPokerColors.getBallColor(ballNumber)
    val innerCircleSize = size * 0.54f

    Box(
        modifier = modifier
            .requiredSize(size)
            .clip(CircleShape)
            .background(if (isStriped) Color.White else ballColor),
        contentAlignment = Alignment.Center
    ) {
        // Striped ball (9-15): middle horizontal colored band with fixed width = size
        if (isStriped) {
            Box(
                modifier = Modifier
                    .width(size)
                    .height(size * 0.48f)
                    .background(ballColor)
            )
        }

        // Inner White Disc with ball number in black
        Box(
            modifier = Modifier
                .requiredSize(innerCircleSize)
                .clip(CircleShape)
                .background(Color.White),
            contentAlignment = Alignment.Center
        ) {
            Text(
                text = "$ballNumber",
                fontSize = if (ballNumber >= 10) (innerCircleSize.value * 0.50f).sp else (innerCircleSize.value * 0.60f).sp,
                fontWeight = FontWeight.Black,
                color = Color.Black,
                textAlign = TextAlign.Center
            )
        }
    }
}
