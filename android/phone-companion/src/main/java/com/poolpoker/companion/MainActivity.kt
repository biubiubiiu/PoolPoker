package com.poolpoker.companion

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.poolpoker.companion.ui.theme.CompanionAppTheme
import com.poolpoker.shared.RoomModel
import com.poolpoker.shared.RoomStatus

class MainActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        setContent {
            CompanionAppTheme {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background
                ) {
                    CompanionAppScreen(context = this)
                }
            }
        }
    }
}

@Composable
fun CompanionAppScreen(context: ComponentActivity) {
    var serverUrl by remember { mutableStateOf("http://10.0.2.2:3000") }
    val defaultUserName = stringResource(R.string.default_companion_name)
    var userName by remember { mutableStateOf(defaultUserName) }
    var roomCodeInput by remember { mutableStateOf("") }
    var connectionStatus by remember { mutableStateOf(context.getString(R.string.status_disconnected)) }
    var currentRoom by remember { mutableStateOf<RoomModel?>(null) }

    DisposableEffect(Unit) {
        CompanionSocketManager.onStatusChanged = { status ->
            connectionStatus = status
        }
        CompanionSocketManager.onRoomUpdated = { room ->
            currentRoom = room
        }
        onDispose {
            CompanionSocketManager.onStatusChanged = null
            CompanionSocketManager.onRoomUpdated = null
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(stringResource(R.string.app_title), fontSize = 20.sp, fontWeight = FontWeight.Bold)
        Text(stringResource(R.string.app_subtitle), fontSize = 12.sp, color = MaterialTheme.colorScheme.secondary)

        Spacer(modifier = Modifier.height(16.dp))

        OutlinedTextField(
            value = serverUrl,
            onValueChange = { serverUrl = it },
            label = { Text(stringResource(R.string.label_server_url)) },
            modifier = Modifier.fillMaxWidth()
        )

        Spacer(modifier = Modifier.height(8.dp))

        OutlinedTextField(
            value = userName,
            onValueChange = { userName = it },
            label = { Text(stringResource(R.string.label_player_name)) },
            modifier = Modifier.fillMaxWidth()
        )

        Spacer(modifier = Modifier.height(8.dp))

        Button(
            onClick = {
                CompanionSocketManager.connect(context, serverUrl, userName)
            },
            modifier = Modifier.fillMaxWidth()
        ) {
            Text(stringResource(R.string.btn_connect))
        }

        Text(
            text = stringResource(R.string.status_format, connectionStatus),
            color = MaterialTheme.colorScheme.primary,
            modifier = Modifier.padding(vertical = 8.dp)
        )

        HorizontalDivider(modifier = Modifier.padding(vertical = 8.dp))

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Button(
                onClick = { CompanionSocketManager.createRoom() },
                modifier = Modifier.weight(1f).padding(end = 4.dp)
            ) {
                Text(stringResource(R.string.btn_create_room))
            }

            OutlinedTextField(
                value = roomCodeInput,
                onValueChange = { roomCodeInput = it },
                label = { Text(stringResource(R.string.label_room_code)) },
                modifier = Modifier.weight(1f).padding(horizontal = 4.dp)
            )

            Button(
                onClick = {
                    if (roomCodeInput.isNotBlank()) {
                        CompanionSocketManager.joinRoom(roomCodeInput)
                    }
                },
                modifier = Modifier.weight(1f).padding(start = 4.dp)
            ) {
                Text(stringResource(R.string.btn_join))
            }
        }

        currentRoom?.let { room ->
            Spacer(modifier = Modifier.height(16.dp))
            Card(
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text(
                        text = stringResource(R.string.room_status_format, room.code, room.status.value),
                        fontWeight = FontWeight.Bold
                    )
                    Text(text = stringResource(R.string.pocketed_balls_format, room.pocketedBallNumbers.joinToString(", ")))

                    if (room.status == RoomStatus.WAITING) {
                        Button(
                            onClick = { CompanionSocketManager.startGame() },
                            modifier = Modifier.padding(top = 8.dp)
                        ) {
                            Text(stringResource(R.string.btn_start_game))
                        }
                    }

                    Spacer(modifier = Modifier.height(8.dp))
                    Text(stringResource(R.string.label_member_list), fontWeight = FontWeight.SemiBold)
                    LazyColumn(modifier = Modifier.heightIn(max = 150.dp)) {
                        items(room.players) { player ->
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(vertical = 2.dp),
                                horizontalArrangement = Arrangement.SpaceBetween
                            ) {
                                Text("${player.avatar} ${player.name}")
                                Text(stringResource(R.string.card_count_left_format, player.cardCount))
                            }
                        }
                    }
                }
            }
        }
    }
}
