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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.poolpoker.shared.RoomModel
import com.poolpoker.shared.RoomStatus

class MainActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        setContent {
            MaterialTheme {
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
    var userName by remember { mutableStateOf("手机挂载端") }
    var roomCodeInput by remember { mutableStateOf("") }
    var connectionStatus by remember { mutableStateOf("未连接") }
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
        Text("🎱 PoolPoker Phone Companion", fontSize = 20.sp, fontWeight = FontWeight.Bold)
        Text("手表协同中继应用", fontSize = 12.sp, color = MaterialTheme.colorScheme.secondary)

        Spacer(modifier = Modifier.height(16.dp))

        OutlinedTextField(
            value = serverUrl,
            onValueChange = { serverUrl = it },
            label = { Text("服务器地址") },
            modifier = Modifier.fillMaxWidth()
        )

        Spacer(modifier = Modifier.height(8.dp))

        OutlinedTextField(
            value = userName,
            onValueChange = { userName = it },
            label = { Text("玩家昵称") },
            modifier = Modifier.fillMaxWidth()
        )

        Spacer(modifier = Modifier.height(8.dp))

        Button(
            onClick = {
                CompanionSocketManager.connect(context, serverUrl, userName)
            },
            modifier = Modifier.fillMaxWidth()
        ) {
            Text("连接到服务器")
        }

        Text(
            text = "状态: $connectionStatus",
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
                Text("创建房间")
            }

            OutlinedTextField(
                value = roomCodeInput,
                onValueChange = { roomCodeInput = it },
                label = { Text("4位房间码") },
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
                Text("加入")
            }
        }

        currentRoom?.let { room ->
            Spacer(modifier = Modifier.height(16.dp))
            Card(
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text("🏠 房间: ${room.code} | 状态: ${room.status.value}", fontWeight = FontWeight.Bold)
                    Text("已进球: ${room.pocketedBallNumbers.joinToString(", ")}")

                    if (room.status == RoomStatus.WAITING) {
                        Button(
                            onClick = { CompanionSocketManager.startGame() },
                            modifier = Modifier.padding(top = 8.dp)
                        ) {
                            Text("开始游戏")
                        }
                    }

                    Spacer(modifier = Modifier.height(8.dp))
                    Text("成员列表:", fontWeight = FontWeight.SemiBold)
                    LazyColumn(modifier = Modifier.heightIn(max = 150.dp)) {
                        items(room.players) { player ->
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(vertical = 2.dp),
                                horizontalArrangement = Arrangement.SpaceBetween
                            ) {
                                Text("${player.avatar} ${player.name}")
                                Text("剩余牌数: ${player.cardCount}")
                            }
                        }
                    }
                }
            }
        }
    }
}
