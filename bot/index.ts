// Tokens and stuff.
import 'json5/lib/require'
import { testPilots, host } from '../config.json5'
import { version } from '../package.json'
import * as ms from 'ms'
import { execSync } from 'child_process'
import { randomBytes } from 'crypto'
// Commands.
import {
  handleRequest, handleSay, handleEditLastSay, handleAvatar, handleListserverregions,
  handleEdit, handleType, handleRemindme, handleChangeserverregion, handleLeave
} from './commands/utilities'
import {
  handleChoose,
  handleReverse,
  handle8Ball,
  handleRepeat, handleRandom,
  handleZalgo, handleDezalgo, handleCalculate
} from './commands/games'
import {
  handleUrban, handleCat, handleDog, handleRobohash, handleApod, handleWeather, handleNamemc,
  handleCurrency,
  handleDefine
} from './commands/api'
import { handleGunfight, handleAccept } from './commands/gunfight'
import {
  handleKick, handleBan, handleUnban, handleMute, handleUnmute, handleWarn,
  handleGiverole, handleTakerole, handleWarnings, handleClearwarns, handleRemovewarn, handlePurge
} from './commands/admin'

// We need types.
import { client, event, DB, mongoDB } from './imports/types'
import { getArguments, getServerSettings } from './imports/tools'
import { checkChannelPermission } from './imports/permissions'
import help from './commands/help'

// MongoDB.
// Get MongoDB.
import { MongoClient } from 'mongodb'
// Get the token needed.
const { mongoURL } = require('../config.json5')
// Create a MongoDB instance.
let db: mongoDB
MongoClient.connect(mongoURL === 'dotenv' ? process.env.MONGO_URL : mongoURL, (err, client) => {
  if (err) throw new Error('Error:\n' + err)
  console.log('Bot connected successfully to MongoDB.')
  db = client.db('ivebot')
})

// All commands which take (message, sendResponse) as args and can be appended and interpreted.
const appendableCommandMaps: { [index: string]: Function } = {
  // Choose.
  '/choose': handleChoose,
  '/cho': handleChoose,
  // Currency conversion.
  '/currency': handleCurrency,
  '/cur': handleCurrency,
  // Random.
  '/random': handleRandom,
  '/rand': handleRandom,
  // Define.
  '/define': handleDefine,
  '/def': handleDefine,
  // Reverse.
  '/reverse': handleReverse,
  '/rev': handleReverse,
  // 8ball.
  '/8ball': handle8Ball,
  // Repeat.
  '/repeat': handleRepeat,
  '/rep': handleRepeat,
  // Urban.
  '/urban': handleUrban,
  '/urb': handleUrban,
  // Cat.
  '/cat': handleCat,
  // Dog.
  '/dog': handleDog,
  // Zalgo.
  '/zalgo': handleZalgo,
  '/zgo': handleZalgo,
  // Dezalgo.
  '/dezalgo': handleDezalgo,
  '/dzgo': handleDezalgo,
  // Robohash.
  '/robohash': handleRobohash,
  '/robo': handleRobohash,
  '/rh': handleRobohash,
  // Astronomy picture of the day.
  '/astronomy-picture-of-the-day': handleApod,
  '/apod': handleApod,
  // Calculator.
  '/calculate': handleCalculate,
  '/calc': handleCalculate,
  // List available server regions.
  '/listserverregions': handleListserverregions,
  '/lsr': handleListserverregions
}

// When client gains/loses a member, it will callback.
export const guildMemberEditCallback = (client: client) => async (member: {
  guild_id: string, id: string // eslint-disable-line indent
}, event: { t: string, d: {
  user: { username: string, discriminator: string, bot: boolean }
} }) => { // eslint-disable-line indent
  // WeChill specific configuration.
  if (member.guild_id === '402423671551164416' && event.t === 'GUILD_MEMBER_REMOVE') {
    const message = `Well ${event.d.user.username}#${event.d.user.discriminator} left us.`
    client.sendMessage({ to: '402437089557217290', message })
    return // Why wait.
  } else if (member.guild_id === '402423671551164416' && event.t === 'GUILD_MEMBER_ADD') {
    const message = `Yoyo <@${member.id}> welcome to WeChill, stay chill.`
    client.sendMessage({ to: '402437089557217290', message })
    return // Why wait.
  }
  const serverSettings = await getServerSettings(db, member.guild_id)
  /* if (event.t === 'GUILD_MEMBER_REMOVE' && serverSettings.joinLeaveMessages[2]) {
    const channelID = Object.keys(client.servers[member.guild_id].channels).find(
      element => client.servers[member.guild_id].channels[element].name ===
        serverSettings.joinLeaveMessages[0]
    )
    client.sendMessage({
      to: client.servers[member.guild_id].channels[channelID].name,
      message: serverSettings.joinLeaveMessages[2]
    })
  } else if (event.t === 'GUILD_MEMBER_ADD' && serverSettings.joinLeaveMessages[1]) {
    const channelID = Object.keys(client.servers[member.guild_id].channels).find(
      element => client.servers[member.guild_id].channels[element].name ===
        serverSettings.joinLeaveMessages[0]
    )
    client.sendMessage({
      to: client.servers[member.guild_id].channels[channelID].name,
      message: serverSettings.joinLeaveMessages[1]
    })
  } */
  if (event.t === 'GUILD_MEMBER_ADD' && serverSettings.joinAutorole && !event.d.user.bot) {
    console.log(member, event)
    const roles = serverSettings.joinAutorole.split('|')
    for (let x = 0; x < roles.length; x++) {
      const roleID = Object.keys(client.servers[member.guild_id].roles).find(
        element => client.servers[member.guild_id].roles[element].name === roles[x]
      )
      client.addToRole({
        serverID: member.guild_id,
        userID: member.id,
        roleID
      })
    }
  }
}

// When client recieves a message, it will callback.
export default (client: client, tempDB: DB, onlineSince: number) => async (
  user: string,
  userID: string,
  channelID: string,
  message: string,
  event: event
) => {
  // Disable bots and webhooks from being responded to.
  try { if (client.users[userID].bot) return } catch (e) { return }
  try { if (!checkChannelPermission(client, client.id, channelID, 11)) return } catch (e) {}
  // Helper variables and functions.
  // Convert message to lowercase to ensure it works.
  const command = message.toLocaleLowerCase()
  // Helper command to send message to same channel.
  const sendResponse = (m: string | Buffer, cb?: (error: {}, response: { id: string }) => void, e?: {}) => {
    client.sendMessage({
      to: channelID, message: m, embed: e || undefined
    }, cb)
  }
  // Is the person a test pilot.
  const testPilot: string = testPilots.find((user: string) => user === userID)
  // Non-appendable commands which have to be re-defined on all callbacks. Taxing and waste of RAM.
  const commandMaps: { [index: string]: Function } = {
    // Linking for authentication on the web dashboard.
    '/token': () => {
      let secureToken = randomBytes(3).toString('hex')
      tempDB.link[secureToken] = userID
      client.sendMessage({
        to: userID,
        message: 'Your token is: **' + secureToken + '** | **DO NOT SHARE THIS WITH ANYONE >_<**'
      }, (err: string, a: { id: string }) => {
        if (err) {
          sendResponse('There was an error processing your request (unable to DM token)')
          return
        }
        setTimeout(() => {
          client.deleteMessage({ channelID: userID, messageID: a.id })
        }, 30000)
      })
      sendResponse('The token has been DMed ✅' +
        ' | **It will be deleted after 30 seconds.** | **DO NOT SHARE THIS WITH ANYONE >_<**',
      (err: string, a: { id: string }) => {
        if (err) {
          sendResponse('There was an error processing your request.')
          return
        }
        setTimeout(() => {
          client.deleteMessage({ channelID, messageID: a.id })
        }, 30000)
      })
    },
    // Weather.
    '/weather': () => handleWeather(message, sendResponse, client, channelID),
    '/wt': () => handleWeather(message, sendResponse, client, channelID),
    // NameMC port.
    '/namemc': () => handleNamemc(message, sendResponse, client, channelID),
    '/nmc': () => handleNamemc(message, sendResponse, client, channelID),
    // Request.
    '/request': () => { if (testPilot) handleRequest(client, userID, sendResponse, message) },
    '/req': () => { if (testPilot) handleRequest(client, userID, sendResponse, message) },
    // Gunfight.
    '/gunfight': () => handleGunfight(command, userID, sendResponse, tempDB, channelID),
    '/gfi': () => handleGunfight(command, userID, sendResponse, tempDB, channelID),
    '/accept': () => handleAccept(tempDB, userID, sendResponse, channelID),
    // Say.
    '/say': () => handleSay(message, sendResponse, client, event, testPilot, tempDB),
    '/type': () => handleType(message, sendResponse, client, event, testPilot, tempDB),
    '/editLastSay': () => handleEditLastSay(message, sendResponse, client, event, testPilot, tempDB),
    '/els': () => handleEditLastSay(message, sendResponse, client, event, testPilot, tempDB),
    '/edit': () => handleEdit(message, sendResponse, client, event),
    // Avatar.
    '/avatar': () => handleAvatar(message, sendResponse, client, userID),
    '/av': () => handleAvatar(message, sendResponse, client, userID),
    // Remind me.
    '/remindme': () => handleRemindme(message, sendResponse, client, userID),
    '/rm': () => handleRemindme(message, sendResponse, client, userID),
    // Leave.
    '/leave': () => handleLeave(sendResponse, client, event, tempDB),
    // Server region commands.
    '/changeserverregion': () => handleChangeserverregion(client, event, sendResponse, message),
    '/csr': () => handleChangeserverregion(client, event, sendResponse, message),
    // Administrative commands.
    '/ban': () => handleBan(client, event, sendResponse, message),
    '/banana': () => handleBan(client, event, sendResponse, message),
    '/nuke': () => handleBan(client, event, sendResponse, message),
    '/unban': () => handleUnban(client, event, sendResponse, message),
    '/kick': () => handleKick(client, event, sendResponse, message),
    '/purge': () => handlePurge(client, event, sendResponse, message),
    '/mute': () => handleMute(client, event, sendResponse, message),
    '/unmute': () => handleUnmute(client, event, sendResponse, message),
    '/warn': () => handleWarn(client, event, sendResponse, message, db),
    '/clearwarns': () => handleClearwarns(client, event, sendResponse, message, db),
    '/clearw': () => handleClearwarns(client, event, sendResponse, message, db),
    '/cw': () => handleClearwarns(client, event, sendResponse, message, db),
    '/removewarn': () => handleRemovewarn(client, event, sendResponse, message, db),
    '/removew': () => handleRemovewarn(client, event, sendResponse, message, db),
    '/rw': () => handleRemovewarn(client, event, sendResponse, message, db),
    '/warnings': () => handleWarnings(client, event, sendResponse, message, db),
    '/warns': () => handleWarnings(client, event, sendResponse, message, db),
    // Version, about, ping, uptime, remoteexec for remote command line.
    '/version': () => sendResponse(`**IveBot ${version}**`),
    '/about': () => sendResponse(`**IveBot ${version}**
IveBot is a Discord bot written with discord.io and care.
Unlike most other dumb bots, IveBot was not written with discord.js and has 0% copied code.
Built with community feedback mainly, IveBot does a lot of random stuff and fun.
IveBot 2.0 is planned to be built complete with administrative commands and a web dashboard.
For information on what IveBot can do, type **/help** or **/halp**.
The source code can be found here: <https://github.com/retrixe/IveBot>
For noobs, this bot is licensed and protected by law. Copy code and I will sue you for a KitKat.`),
    '/ping': () => {
      // Get current time.
      const startTime = new Date().getTime()
      // Then send a message.
      sendResponse('Ping?', (err: {}, { id }: { id: string }) => {
        // Latency (unrealistic, this can be negative or positive)
        const fl = startTime - new Date().getTime()
        // Divide latency by 2 to get more realistic latency and get absolute value (positive)
        const l = Math.abs(fl) / 2
        // Get latency.
        const e = l < 200 ? `latency of **${l}ms** 🚅🔃` : `latency of **${l}ms** 🔃`
        if (err) sendResponse('IveBot has experienced an internal error.')
        client.editMessage({
          channelID,
          messageID: id,
          message: `Aha! IveBot ${version} is connected to your server with a ${e}`
        })
      })
    },
    '/uptime': () => sendResponse(ms(Math.abs(new Date().getTime()) - onlineSince, { long: true })),
    '/remoteexec': () => { if (userID === host) sendResponse(execSync(getArguments(message), { encoding: 'utf8' })) },
    // Role system.
    // Certain commands rely on server settings. I hope we can await for them.
    '/giverole': async () => {
      const serverSettings = await getServerSettings(db, client.channels[event.d.channel_id].guild_id)
      handleGiverole(client, event, sendResponse, message, serverSettings)
    },
    '/gr': async () => {
      const serverSettings = await getServerSettings(db, client.channels[event.d.channel_id].guild_id)
      handleGiverole(client, event, sendResponse, message, serverSettings)
    },
    '/takerole': async () => {
      const serverSettings = await getServerSettings(db, client.channels[event.d.channel_id].guild_id)
      handleTakerole(client, event, sendResponse, message, serverSettings)
    },
    '/tr': async () => {
      const serverSettings = await getServerSettings(db, client.channels[event.d.channel_id].guild_id)
      handleTakerole(client, event, sendResponse, message, serverSettings)
    }
  }
  // Check for the commands in appendableCommandMaps.
  for (let i = 0; i < Object.keys(appendableCommandMaps).length; i++) {
    if (command.split(' ')[0] === Object.keys(appendableCommandMaps)[i]) {
      appendableCommandMaps[Object.keys(appendableCommandMaps)[i]](message, sendResponse)
      break
    }
  }
  // Check for the commands in commandMaps.
  for (let i = 0; i < Object.keys(commandMaps).length; i++) {
    if (command.split(' ')[0] === Object.keys(commandMaps)[i]) {
      commandMaps[Object.keys(commandMaps)[i]]()
      break
    }
  }
  // Help command.
  if (command.startsWith('/help') || command.startsWith('/halp')) help(message, client, channelID, userID)
  // Auto responses and easter eggs.
  else if (command.startsWith('is dot a good boy')) sendResponse('Shame on you. He\'s undefined.')
  else if (command.startsWith('iphone x')) sendResponse(`You don't deserve it. 😎`)
  else if (command.startsWith('triggered')) sendResponse('Ah, pathetic people again.')
  else if (command.startsWith('ayy')) sendResponse('lmao')
  // Handle answers to gunfight.
  // else if (command in ['fire', 'water', 'gun', 'dot']) return
}
