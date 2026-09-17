const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, REST, Routes, SlashCommandBuilder, AttachmentBuilder } = require('discord.js')

const TOKEN = process.env.TOKEN
const CLIENT_ID = process.env.CLIENT_ID
const GUILD_ID = process.env.GUILD_ID
const STAFF_CHANNEL_ID = process.env.STAFF_CHANNEL_ID
const REGISTER_CHANNEL_ID = process.env.REGISTER_CHANNEL_ID

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
})

const registrations = new Map()
let saveMessageId = null

async function saveData() {
  try {
    const channel = await client.channels.fetch(STAFF_CHANNEL_ID)
    let csv = 'Discord ID,Discord Username,Fantasy Username,Registered At\n'
    for (const [discordId, data] of registrations.entries()) {
      csv += `${discordId},${data.discordUsername},${data.fantasyUsername},${data.registeredAt}\n`
    }
    const content = 'FANTASYDATA:' + csv
    if (saveMessageId) {
      const msg = await channel.messages.fetch(saveMessageId)
      await msg.edit(content)
    } else {
      const msg = await channel.send(content)
      saveMessageId = msg.id
    }
  } catch (e) {
    console.error('Erro ao guardar:', e.message)
  }
}

async function loadData() {
  try {
    const channel = await client.channels.fetch(STAFF_CHANNEL_ID)
    const messages = await channel.messages.fetch({ limit: 20 })
    const dataMsg = messages.find(m => m.author.id === client.user.id && m.content.startsWith('FANTASYDATA:'))
    if (dataMsg) {
      const csv = dataMsg.content.replace('FANTASYDATA:', '')
      const lines = csv.split('\n').slice(1).filter(l => l.trim())
      for (const line of lines) {
        const [discordId, discordUsername, fantasyUsername, registeredAt] = line.split(',')
        if (discordId) {
          registrations.set(discordId, { discordUsername, fantasyUsername, registeredAt })
        }
      }
      saveMessageId = dataMsg.id
      console.log(`${registrations.size} inscrições carregadas`)
    }
  } catch (e) {
    console.log('Sem dados existentes')
  }
}

async function registerCommands() {
  const commands = [
    new SlashCommandBuilder()
      .setName('setup-fantasy')
      .setDescription('Publicar a mensagem de registo Fantasy (admin)'),
    new SlashCommandBuilder()
      .setName('lookup')
      .setDescription('Procurar o Discord de um nome Fantasy (admin)')
      .addStringOption(o => o.setName('pseudo').setDescription('Nome Fantasy a procurar').setRequired(true)),
    new SlashCommandBuilder()
      .setName('export')
      .setDescription('Exportar a lista de inscritos em CSV (admin)'),
  ].map(c => c.toJSON())

  const rest = new REST({ version: '10' }).setToken(TOKEN)
  await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands })
  console.log('Comandos registados')
}

client.on('ready', async () => {
  console.log(`Bot ligado : ${client.user.tag}`)
  await registerCommands()
  await loadData()
})

client.on('interactionCreate', async interaction => {

  // SETUP
  if (interaction.isChatInputCommand() && interaction.commandName === 'setup-fantasy') {
    const isAdmin = interaction.member.permissions.has('Administrator')
    if (!isAdmin) return interaction.reply({ content: 'Permissão negada.', ephemeral: true })

    const channel = await client.channels.fetch(REGISTER_CHANNEL_ID)

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('register_fantasy')
        .setLabel('🎮 Registar o meu nome Fantasy')
        .setStyle(ButtonStyle.Primary)
    )

    await channel.send({
      content:
        '**Regista o teu nome Fantasy Liga Portugal aqui 👇**\n\n' +
        'Clica no botão abaixo e introduz o teu nome para seres identificado nos classificações todas as semanas e receberes as tuas recompensas em Freebets.\n\n' +
        '⚠️ Certifica-te de que o teu nome é exatamente igual ao da plataforma Fantasy.',
      components: [row]
    })

    await interaction.reply({ content: 'Mensagem publicada !', ephemeral: true })
  }

  // BOTÃO REGISTO
  if (interaction.isButton() && interaction.customId === 'register_fantasy') {
    const modal = new ModalBuilder()
      .setCustomId('fantasy_modal')
      .setTitle('Registo Fantasy Liga Portugal')

    const input = new TextInputBuilder()
      .setCustomId('fantasy_pseudo')
      .setLabel('O teu nome Fantasy Liga Portugal')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('Ex: CristianoFan99')
      .setRequired(true)

    modal.addComponents(new ActionRowBuilder().addComponents(input))
    await interaction.showModal(modal)
  }

  // MODAL SUBMIT
  if (interaction.isModalSubmit() && interaction.customId === 'fantasy_modal') {
    const fantasyUsername = interaction.fields.getTextInputValue('fantasy_pseudo').trim()
    const discordId = interaction.user.id
    const discordUsername = interaction.user.username

    const existing = registrations.get(discordId)

    registrations.set(discordId, {
      discordUsername,
      fantasyUsername,
      registeredAt: new Date().toISOString()
    })

    await saveData()

    const staffChannel = await client.channels.fetch(STAFF_CHANNEL_ID)
    if (existing) {
      await staffChannel.send(`🔄 **${discordUsername}** (<@${discordId}>) atualizou o seu nome Fantasy : **${existing.fantasyUsername}** → **${fantasyUsername}**`)
    } else {
      await staffChannel.send(`✅ **${discordUsername}** (<@${discordId}>) registou-se com o nome Fantasy : **${fantasyUsername}**`)
    }

    await interaction.reply({
      content: existing
        ? `✅ O teu nome foi atualizado : **${fantasyUsername}**`
        : `✅ Registo efetuado com sucesso ! O teu nome Fantasy **${fantasyUsername}** está registado. Boa sorte 🍀`,
      ephemeral: true
    })
  }

  // LOOKUP
  if (interaction.isChatInputCommand() && interaction.commandName === 'lookup') {
    const isAdmin = interaction.member.permissions.has('Administrator')
    if (!isAdmin) return interaction.reply({ content: 'Permissão negada.', ephemeral: true })

    const pseudo = interaction.options.getString('pseudo').toLowerCase()
    const results = []

    for (const [discordId, data] of registrations.entries()) {
      if (data.fantasyUsername.toLowerCase().includes(pseudo)) {
        results.push(`**${data.fantasyUsername}** → <@${discordId}> (${data.discordUsername})`)
      }
    }

    if (results.length === 0) {
      return interaction.reply({ content: `Nenhum resultado para **${pseudo}**`, ephemeral: true })
    }

    await interaction.reply({ content: results.join('\n'), ephemeral: true })
  }

  // EXPORT CSV
  if (interaction.isChatInputCommand() && interaction.commandName === 'export') {
    const isAdmin = interaction.member.permissions.has('Administrator')
    if (!isAdmin) return interaction.reply({ content: 'Permissão negada.', ephemeral: true })

    let csv = 'Discord ID,Discord Username,Fantasy Username,Registered At\n'
    for (const [discordId, data] of registrations.entries()) {
      csv += `${discordId},${data.discordUsername},${data.fantasyUsername},${data.registeredAt}\n`
    }

    const buffer = Buffer.from(csv, 'utf-8')
    const attachment = new AttachmentBuilder(buffer, { name: 'fantasy_registrations.csv' })

    await interaction.reply({ files: [attachment], ephemeral: true })
  }
})

client.login(TOKEN)
