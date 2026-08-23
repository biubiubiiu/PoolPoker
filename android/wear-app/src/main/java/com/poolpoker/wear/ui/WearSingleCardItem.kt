package com.poolpoker.wear.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.wear.compose.material3.Card
import androidx.wear.compose.material3.Text
import com.poolpoker.shared.CardModel
import com.poolpoker.wear.R
import com.poolpoker.wear.ui.theme.PoolPokerColors

@Composable
fun WearSingleCardItem(
    card: CardModel,
    isPocketed: Boolean,
    onPocketClicked: () -> Unit
) {
    val alphaValue = if (isPocketed) 0.4f else 1.0f

    Card(
        onClick = { if (!isPocketed) onPocketClicked() },
        modifier = Modifier
            .fillMaxWidth()
            .height(52.dp)
            .padding(vertical = 2.dp)
            .alpha(alphaValue)
    ) {
        Row(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                // Billiard Ball Badge (Solid 1-8 / Striped 9-15) with strict 1:1 circular size
                BilliardBallBadge(
                    ballNumber = card.ballNumber,
                    size = 32.dp
                )

                Spacer(modifier = Modifier.width(10.dp))

                // Card Suit & Rank
                Text(
                    text = "${card.suit} ${card.rank}",
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Bold,
                    color = PoolPokerColors.getSuitColor(card.suitType)
                )
            }

            // Status Badge / Action Text
            if (isPocketed) {
                Text(
                    text = stringResource(R.string.card_pocketed),
                    fontSize = 10.sp,
                    color = PoolPokerColors.StatusPocketed,
                    fontWeight = FontWeight.SemiBold
                )
            } else {
                Text(
                    text = stringResource(R.string.card_tap_to_clear),
                    fontSize = 10.sp,
                    color = PoolPokerColors.StatusClearGold,
                    fontWeight = FontWeight.Bold
                )
            }
        }
    }
}
