import { JsonResponse, sendFollowup } from "./utils.js";

// ── Constants ─────────────────────────────────────────────────────────────────

const ROADBLOCK_HEADER_IMAGE =
  "https://media.discordapp.net/attachments/1259308675282239599/1266871294452957234/Clue-Roadblock.webp?ex=69d62115&is=69d4cf95&hm=816003949a0106d55baf324ef16073384f20ee7405e353953656bba6b6de7275&=&format=webp&width=300&height=638";
const ROUTE_INFO_HEADER_IMAGE =
  "https://media.discordapp.net/attachments/1259308675282239599/1266871294121476267/Clue-information.webp?ex=69218395&is=69203215&hm=e12568119af867d0dce0ffedf3a6e3ba29c5e44b6c635cd68533cf0513388dac&format=webp&width=256&height=560&";

const DETOUR_HEADER_IMAGE =
  "https://media.discordapp.net/attachments/1259308675282239599/1266871293823684619/Clue-Detour.webp?ex=69af3cd5&is=69adeb55&hm=e0ef2c484e52f704e5ba22685deea297fe930f9b8561fe60dc57c99964056879&=&format=webp&width=468&height=992";

const ROUTE_INFO_HEADER = `# ⬥ ─── [ROUTE INFO](${ROUTE_INFO_HEADER_IMAGE}) ───⬥`;
const ROUTE_INFO_FOOTER = "# ⬥ ─────────────────⬥";
const TRAVEL_INFO_HEADER = "# ⬥ ─── TRAVEL INFO ───⬥";
const TRAVEL_INFO_FOOTER = "# ⬥ ───────────────────⬥";

const TRAVEL_EMOJIS = { taxi: "🚕", bus: "🚌", walking: "🚶" };
const TRAVEL_DURATION_LABELS = {
  taxi: "Duration of Ride",
  bus: "Duration of Ride",
  walking: "Duration of Walk",
};
const TRAVEL_VERBS = {
  taxi: "take a taxi",
  bus: "use the bus",
  walking: "walk",
};
const TRAVEL_CMD_SUFFIXES = { taxi: "Taxi", bus: "Bus", walking: "Walk" };
const TRAVEL_MIMU_VERBS = {
  taxi: "taken a taxi, and the driver takes",
  bus: "taken the bus, and the ride takes",
};
const TRAVEL_FREE_VERBS = {
  taxi: "taken a taxi",
  bus: "taken the bus",
  walking: "walked for",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function humanJoin(items) {
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} or ${items[1]}`;
  return items.slice(0, -1).join(", ") + `, or ${items[items.length - 1]}`;
}

function travelCmdSuffix(option) {
  return (
    TRAVEL_CMD_SUFFIXES[option.toLowerCase()] ||
    option
      .split(/\s+/)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join("")
  );
}

function travelVerb(option) {
  return (
    TRAVEL_VERBS[option.toLowerCase()] || `use the ${option.toLowerCase()}`
  );
}

function splitIntoQuartiles(min, max) {
  if (min === max)
    return [
      [min, min],
      [min, min],
      [min, min],
      [min, min],
    ];
  const span = max - min;
  const b1 = min + Math.floor(span / 4);
  const b2 = min + Math.floor(span / 2);
  const b3 = min + Math.floor((3 * span) / 4);
  return [
    [min, b1],
    [b1 + 1, b2],
    [b2 + 1, b3],
    [b3 + 1, max],
  ];
}

function buildIndividualCommand(option, duration, cost, inits) {
  const cmdSuffix = travelCmdSuffix(option);
  const trigger = `!${inits}-${cmdSuffix}`;
  const costVal = parseFloat(cost.replace(/[^0-9.]/g, "") || "0");
  const unit = duration.toLowerCase().includes("hour") ? "hours" : "minutes";
  const nums = [...duration.matchAll(/\d+/g)].map((m) => parseInt(m[0]));

  if (costVal === 0) {
    const fixed = nums[0] ?? "?";
    const past =
      TRAVEL_FREE_VERBS[option.toLowerCase()] ||
      `traveled by ${option.toLowerCase()} for`;
    const body = `You have ${past} **${fixed} ${unit}**, and spent $0. Please use the command \`!${inits}-Arrived\`.`;
    return [
      `Carlbot tag — \`${trigger}\``,
      `!tag add ${trigger.replace("!", "").toLowerCase()} ${body}`,
    ];
  }

  const [minV, maxV] =
    nums.length >= 2
      ? [nums[0], nums[1]]
      : nums.length === 1
        ? [nums[0], nums[0]]
        : [0, 0];
  const costNum = Math.round(costVal);
  const quartiles = splitIntoQuartiles(minV, maxV);
  const r3 = `${quartiles[0][0]}-${quartiles[0][1]}`;
  const r2 = `${quartiles[1][0]}-${quartiles[1][1]}`;
  const r1 = `${quartiles[2][0]}-${quartiles[2][1]}`;
  const r = `${quartiles[3][0]}-${quartiles[3][1]}`;
  const mimuVerb =
    TRAVEL_MIMU_VERBS[option.toLowerCase()] ||
    `traveled by ${option.toLowerCase()} for`;
  const reply =
    `{range:${r}} {range1:${r1}} {range2:${r2}} {range3:${r3}} ` +
    `{choose: [range] | [range1] | [range2] | [range3]} ` +
    `{weightedchoose: 45% | 30% | 15% | 10%} ` +
    `*You have ${mimuVerb} **[choice]** ${unit} to reach your destination. ` +
    `You may now use the command \`!${inits}-Arrived\`. ` +
    `You have spent **$${costNum}** {server_currency}.* ` +
    `{modifybal: -${costNum}}`;
  return [
    `Mimu autoresponder — \`${trigger}\``,
    `/autoresponder add trigger:${trigger} reply:${reply}`,
  ];
}

function getInitials(dest) {
  return dest
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

function slugify(str) {
  return str
    .replace(/[^a-zA-Z0-9 ]/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join("");
}

function row(component) {
  return { type: 1, components: [component] };
}

// ── Modal builders ────────────────────────────────────────────────────────────

function roadblockModal() {
  return {
    type: 9,
    data: {
      custom_id: "modal_roadblock",
      title: "Roadblock Tag Template",
      components: [
        row({
          type: 4,
          custom_id: "leg_number",
          label: "Leg Number",
          placeholder: "e.g. 10",
          style: 1,
          max_length: 10,
        }),
        row({
          type: 4,
          custom_id: "roadblock_title",
          label: "Roadblock Title",
          placeholder: "e.g. WHO IS TRYNA CRASH OUT?",
          style: 1,
          max_length: 200,
        }),
        row({
          type: 4,
          custom_id: "location_name",
          label: "Location Name",
          placeholder: "e.g. Cajon de Maipo",
          style: 1,
          max_length: 100,
        }),
        row({
          type: 4,
          custom_id: "location_image_url",
          label: "Location Image URL",
          placeholder: "https://www.imageURL.com",
          style: 1,
          max_length: 500,
        }),
        row({
          type: 4,
          custom_id: "clue_text",
          label: "Roadblock Clue Text",
          placeholder: "Paste the full clue description here...",
          style: 2,
          max_length: 1000,
        }),
      ],
    },
  };
}

function legStartModal(leg) {
  return {
    type: 9,
    data: {
      custom_id: `modal_legstart:${leg}`,
      title: `Route Info: Leg ${leg} Start`,
      components: [
        row({
          type: 4,
          custom_id: "departure",
          label: "Departure City, Country | Image URL",
          placeholder: "e.g. Santiago, Chile | https://www.imageURL.com",
          style: 1,
          max_length: 600,
        }),
        row({
          type: 4,
          custom_id: "destination",
          label: "Destination city, country | site | airport",
          placeholder: "e.g. Beijing, China | Temple of Heaven | PEK Airport",
          style: 1,
          max_length: 400,
        }),
        row({
          type: 4,
          custom_id: "money",
          label: "Leg Money",
          placeholder: "e.g. $15",
          style: 1,
          max_length: 20,
          required: false,
        }),
        row({
          type: 4,
          custom_id: "flight_time",
          label: "Flight Duration",
          placeholder: "e.g. 3 hours",
          style: 1,
          max_length: 100,
        }),
      ],
    },
  };
}

function taskModal() {
  return {
    type: 9,
    data: {
      custom_id: "modal_task",
      title: "Route Info: Task",
      components: [
        row({
          type: 4,
          custom_id: "tag_name",
          label: "Tag Name",
          placeholder: "e.g. dopamine-land",
          style: 1,
          max_length: 50,
        }),
        row({
          type: 4,
          custom_id: "body",
          label: "Task Description",
          placeholder: "Full task instructions...",
          style: 2,
          max_length: 1000,
        }),
      ],
    },
  };
}

function travelModal(transportCsv, hasCustom) {
  const components = [
    row({
      type: 4,
      custom_id: "tag_name",
      label: "Tag Name",
      placeholder: "e.g. cdm-arrived, dopamine-land",
      style: 1,
      max_length: 50,
    }),
    row({
      type: 4,
      custom_id: "destination",
      label: "Destination",
      placeholder: "e.g. Cajón Del Maipo (blank = skip default welcome text)",
      style: 1,
      max_length: 200,
      required: false,
    }),
    row({
      type: 4,
      custom_id: "extra",
      label: "Extra content (optional)",
      placeholder: "Additional travel information, warnings, etc...",
      style: 2,
      max_length: 1000,
      required: false,
    }),
  ];
  if (hasCustom) {
    components.push(
      row({
        type: 4,
        custom_id: "custom_transport",
        label: "Custom transport name",
        placeholder: "e.g. tuk tuk, railcar",
        style: 1,
        max_length: 50,
        required: false,
      }),
    );
  }
  return {
    type: 9,
    data: {
      custom_id: `modal_travel:${transportCsv}:${hasCustom ? "1" : "0"}`,
      title: "Route Info: Travel",
      components,
    },
  };
}

function detourModal(leg, switchTime) {
  return {
    type: 9,
    data: {
      custom_id: `modal_detour:${leg}:${switchTime}`,
      title: `Detour: Leg ${leg}`,
      components: [
        row({
          type: 4,
          custom_id: "location",
          label: "Location Name (| Image URL optional)",
          placeholder: "e.g. San José | https://www.imageURL.com",
          style: 1,
          max_length: 300,
        }),
        row({
          type: 4,
          custom_id: "option1_name",
          label: "Option 1 Name",
          placeholder: "e.g. Mangled",
          style: 1,
          max_length: 50,
        }),
        row({
          type: 4,
          custom_id: "option1_desc",
          label: "Option 1 Description",
          placeholder: "Describe option 1 task...",
          style: 2,
          max_length: 1000,
        }),
        row({
          type: 4,
          custom_id: "option2_name",
          label: "Option 2 Name",
          placeholder: "e.g. Tangled",
          style: 1,
          max_length: 50,
        }),
        row({
          type: 4,
          custom_id: "option2_desc",
          label: "Option 2 Description",
          placeholder: "Describe option 2 task...",
          style: 2,
          max_length: 1000,
        }),
      ],
    },
  };
}

function singleTravelModal(transport, inits) {
  const cap = transport.charAt(0).toUpperCase() + transport.slice(1);
  return {
    type: 9,
    data: {
      custom_id: `modal_single_travel:${transport}:${inits}`,
      title: `${cap} Details`,
      components: [
        row({
          type: 4,
          custom_id: "duration",
          label: "Duration",
          placeholder: "e.g. 40 to 50 minutes.",
          style: 1,
          max_length: 100,
        }),
        row({
          type: 4,
          custom_id: "cost",
          label: "Cost (blank = free)",
          placeholder: "e.g. $7",
          style: 1,
          max_length: 50,
          required: false,
        }),
      ],
    },
  };
}

function travelInfoModal(transportsCsv, destInitials) {
  const transports = transportsCsv.split(",").filter(Boolean);
  return {
    type: 9,
    data: {
      custom_id: `modal_travel_info:${transportsCsv}:${destInitials}`,
      title: "Travel Tag",
      components: transports.slice(0, 5).map((t) => {
        const cap = t.charAt(0).toUpperCase() + t.slice(1);
        return row({
          type: 4,
          custom_id: `t_${t}`,
          label: cap,
          placeholder: "e.g. 130 to 140 minutes | $20",
          style: 1,
          max_length: 150,
          required: false,
        });
      }),
    },
  };
}

// ── Transport button view ─────────────────────────────────────────────────────

function transportButtonMessage(selectedCsv = "") {
  const selected = new Set(selectedCsv ? selectedCsv.split(",") : []);
  const buttons = [
    { value: "taxi", label: "🚕 Taxi" },
    { value: "bus", label: "🚌 Bus" },
    { value: "walking", label: "🚶 Walking" },
    { value: "custom", label: "✏️ Custom" },
  ].map(({ value, label }) => ({
    type: 2,
    custom_id: `tg:${value}:${selectedCsv}`,
    label,
    style: selected.has(value) ? 3 : 2, // SUCCESS : SECONDARY
  }));

  return {
    content: "Select transport methods:",
    flags: 64,
    components: [
      { type: 1, components: buttons },
      {
        type: 1,
        components: [
          {
            type: 2,
            custom_id: `travel_go:${selectedCsv}`,
            label: "Fill out details →",
            style: 1,
          },
        ],
      },
    ],
  };
}

// ── getField helper ───────────────────────────────────────────────────────────

function getField(interaction, id) {
  for (const r of interaction.data.components ?? []) {
    for (const c of r.components ?? []) {
      if (c.custom_id === id) return (c.value ?? "").trim();
    }
  }
  return "";
}

// ── Command handler ───────────────────────────────────────────────────────────

export function handleCommand(interaction) {
  if (interaction.data.name !== "tag_template") {
    return new JsonResponse({ error: "Unknown command" }, { status: 400 });
  }

  const sub = interaction.data.options?.[0];
  const subName = sub?.name;
  const getOpt = (name) => sub?.options?.find((o) => o.name === name)?.value;

  switch (subName) {
    case "routeinfo_legstart":
      return new JsonResponse(legStartModal(getOpt("leg")));
    case "routeinfo_task":
      return new JsonResponse(taskModal());
    case "routeinfo_travel":
      return new JsonResponse({ type: 4, data: transportButtonMessage() });
    case "detour":
      return new JsonResponse(detourModal(getOpt("leg"), getOpt("switch_time") || ""));
    case "roadblock":
      return new JsonResponse(roadblockModal());
    default:
      return new JsonResponse({ error: "Unknown subcommand" }, { status: 400 });
  }
}

// ── Component (button) handler ────────────────────────────────────────────────

export function handleComponent(interaction) {
  const [action, ...rest] = interaction.data.custom_id.split(":");

  if (action === "tg") {
    const [value, currentCsv = ""] = rest;
    const selected = new Set(currentCsv ? currentCsv.split(",") : []);
    if (selected.has(value)) selected.delete(value);
    else selected.add(value);
    const newCsv = ["taxi", "bus", "walking", "custom"]
      .filter((v) => selected.has(v))
      .join(",");
    return new JsonResponse({ type: 7, data: transportButtonMessage(newCsv) });
  }

  if (action === "travel_go") {
    const selectedCsv = rest[0] || "";
    const selected = new Set(selectedCsv ? selectedCsv.split(",") : []);
    const transportStr = ["taxi", "bus", "walking"]
      .filter((v) => selected.has(v))
      .join(",");
    const hasCustom = selected.has("custom");
    return new JsonResponse(travelModal(transportStr, hasCustom));
  }

  if (action === "single_travel_btn") {
    const [transport, inits] = rest;
    return new JsonResponse(singleTravelModal(transport, inits));
  }

  if (action === "travel_tag_btn") {
    const [transportsCsv, destInitials] = rest;
    return new JsonResponse(travelInfoModal(transportsCsv, destInitials));
  }

  return new JsonResponse({ error: "Unknown component" }, { status: 400 });
}

// ── Modal submit handler ──────────────────────────────────────────────────────

export function handleModalSubmit(interaction, env, ctx) {
  const [modalType, ...parts] = interaction.data.custom_id.split(":");

  switch (modalType) {
    case "modal_roadblock": {
      const leg = getField(interaction, "leg_number");
      const title = getField(interaction, "roadblock_title").toUpperCase();
      const location = getField(interaction, "location_name");
      const imageUrl = getField(interaction, "location_image_url");
      const clue = getField(interaction, "clue_text");

      const locInitials = location
        .split(/\s+/)
        .filter(Boolean)
        .map((w) => w[0])
        .join("")
        .toLowerCase();
      const arrivedTag = `${locInitials}-arrived`;
      const clueTag = `rb-l${leg}`;
      const clueCmd = `!RB-L${leg}`;

      const footer = "# ⬥ " + "─".repeat(title.length + 19) + "⬥";
      const arrivalContent =
        `# ⬥ ─── [ROADBLOCK: ${title}](${ROADBLOCK_HEADER_IMAGE}) ───⬥\n\n` +
        `*Welcome to [${location}](${imageUrl}).*\n\n` +
        `*If you are competing in this roadblock, use the command \`${clueCmd}\` for further details!*\n\n` +
        `*Remember the limit for each partner with the amount of roadblocks each can do!*\n` +
        footer;

      const msg1 = `**TAG 1 of 2 — Arrival announcement (\`!${arrivedTag}\`)**\n\`\`\`\n!tag add ${arrivedTag} ${arrivalContent}\n\`\`\``;
      const msg2 = `**TAG 2 of 2 — Roadblock clue (\`${clueCmd}\`)**\n\`\`\`\n!tag add ${clueTag} ${clue}\n\`\`\``;

      ctx.waitUntil(sendFollowup(env, interaction.token, msg2));
      return new JsonResponse({ type: 4, data: { content: msg1, flags: 64 } });
    }

    case "modal_task": {
      const tag = getField(interaction, "tag_name");
      const body = getField(interaction, "body");
      const content =
        ROUTE_INFO_HEADER + "\n\n" + `*${body}*` + "\n" + ROUTE_INFO_FOOTER;
      return new JsonResponse({
        type: 4,
        data: {
          content: `**Route Info tag (\`!${tag}\`)**\n\`\`\`\n!tag add ${tag} ${content}\n\`\`\``,
          flags: 64,
        },
      });
    }

    case "modal_legstart": {
      const leg = parts[0];
      const depRaw = getField(interaction, "departure");
      const destRaw = getField(interaction, "destination");
      const moneyRaw = getField(interaction, "money");
      const flightRaw = getField(interaction, "flight_time");

      const [depDisplay, depImage = ""] = depRaw
        .split("|")
        .map((s) => s.trim());
      const destParts = destRaw.split("|").map((s) => s.trim());
      const dest = destParts[0];
      const site = destParts[1] || "";
      const airport = destParts[2] || "";
      const destSlug = (dest.split(/\s+/)[0] || "dest")
        .replace(/[^a-z0-9]/gi, "")
        .toLowerCase();
      const destCountry = dest.includes(",")
        ? dest.split(",").pop().trim()
        : dest;

      const money = moneyRaw.replace(/^\$/, "").trim();
      const moneyDisplay = money ? `$${money}` : "";

      const ftNorm = flightRaw.replace(/\bhours\b/gi, "hour");
      const flightTime = /\bflight\b/i.test(ftNorm)
        ? ftNorm
        : `${ftNorm} flight`;

      const tagName = `leg-${leg}`;
      const moneyCmD = `!Claim-Leg${leg}-Money`;
      const destCapSlug = destSlug.charAt(0).toUpperCase() + destSlug.slice(1);
      const touchdownCmd = `!${destCapSlug}-Touchdown`;
      const depText = depImage ? `[${depDisplay}](${depImage})` : depDisplay;

      const paragraphs = [
        `*Make your way from ${depText} to your next destination, **${dest}!***`,
        `*All teams will be put onto the same, equalizing **${flightTime}** to ${destCountry}. Once there, make your way to **${site}** to receive your next clue.*`,
      ];
      if (moneyDisplay) {
        paragraphs.push(
          `*Additionally, you have received **${moneyDisplay}** for this leg of the race. ` +
            `Use the command \`${moneyCmD}\` to claim the money. ` +
            `Remember, only one designated partner should be using this command.*`,
        );
      }
      paragraphs.push(
        airport
          ? `*Use the command \`${touchdownCmd}\` to officially land at ${airport}.*`
          : `*Use the command \`${touchdownCmd}\` to officially land.*`,
      );

      const content =
        ROUTE_INFO_HEADER +
        "\n\n" +
        paragraphs.join("\n\n") +
        "\n" +
        ROUTE_INFO_FOOTER;
      const msg1 = `**Leg Start tag (\`!${tagName}\`)**\n\`\`\`\n!tag add ${tagName} ${content}\n\`\`\``;

      if (moneyDisplay) {
        const mimuReply = `${moneyDisplay} has been added to your account! {modifybal: ${money}}`;
        const msg2 = `**Mimu autoresponder — \`${moneyCmD}\`**\n\`\`\`\n/autoresponder add trigger:${moneyCmD} reply:${mimuReply}\n\`\`\``;
        ctx.waitUntil(sendFollowup(env, interaction.token, msg2));
      }

      return new JsonResponse({ type: 4, data: { content: msg1, flags: 64 } });
    }

    case "modal_travel": {
      const [transportCsv, hasCustomFlag] = parts;
      const hasCustom = hasCustomFlag === "1";
      const tag = getField(interaction, "tag_name");
      const dest = getField(interaction, "destination");
      const extra = getField(interaction, "extra");
      const customTransport = hasCustom
        ? getField(interaction, "custom_transport")
        : "";

      const transportParts = transportCsv
        ? transportCsv.split(",").filter(Boolean)
        : [];
      if (customTransport) transportParts.push(customTransport);

      const paragraphs = [];
      if (extra) paragraphs.push(`*${extra}*`);
      if (dest) {
        const destDisplay = `**${dest}**`;
        if (transportParts.length) {
          paragraphs.push(
            `*Make your way by ${humanJoin(transportParts)} to ${destDisplay} to receive your next clue.*`,
          );
        } else {
          paragraphs.push(
            `*Make your way to ${destDisplay} to receive your next clue.*`,
          );
        }
        const inits = getInitials(dest);
        if (transportParts.length) {
          paragraphs.push(
            `*For more information on how to reach this destination, use the command \`!${inits}-Travel\`. If you would like to pause, use the command \`!Pause\`.*`,
          );
        } else {
          paragraphs.push(
            `*Once you arrive, use the command \`!${inits}-Arrived\`.*`,
          );
        }
      }

      const content =
        ROUTE_INFO_HEADER +
        "\n\n" +
        paragraphs.join("\n\n") +
        "\n" +
        ROUTE_INFO_FOOTER;
      const msg1 = `**Route Info tag (\`!${tag}\`)**\n\`\`\`\n!tag add ${tag} ${content}\n\`\`\``;

      if (dest && transportParts.length) {
        const inits = getInitials(dest);
        const transportsCsv = transportParts.join(",");
        const followup =
          transportParts.length === 1
            ? {
                content:
                  "-# One transport option — enter time & cost to generate the command",
                flags: 64,
                components: [
                  {
                    type: 1,
                    components: [
                      {
                        type: 2,
                        custom_id: `single_travel_btn:${transportParts[0]}:${inits}`,
                        label: "Enter time & cost →",
                        style: 2,
                      },
                    ],
                  },
                ],
              }
            : {
                content: `-# Next: generate the travel tag \`!${inits.toLowerCase()}-travel\``,
                flags: 64,
                components: [
                  {
                    type: 1,
                    components: [
                      {
                        type: 2,
                        custom_id: `travel_tag_btn:${transportsCsv}:${inits}`,
                        label: "Generate travel tag →",
                        style: 2,
                      },
                    ],
                  },
                ],
              };
        ctx.waitUntil(sendFollowup(env, interaction.token, followup));
      }

      return new JsonResponse({ type: 4, data: { content: msg1, flags: 64 } });
    }

    case "modal_single_travel": {
      const [transport, inits] = parts;
      const duration = getField(interaction, "duration");
      const cost = getField(interaction, "cost");
      const [label, command] = buildIndividualCommand(
        transport,
        duration,
        cost,
        inits,
      );
      return new JsonResponse({
        type: 4,
        data: {
          content: `**${label}**\n\`\`\`\n${command}\n\`\`\``,
          flags: 64,
        },
      });
    }

    case "modal_travel_info": {
      const [transportsCsv, destInitials] = parts;
      const transports = transportsCsv.split(",").filter(Boolean);

      const entries = transports
        .slice(0, 5)
        .map((t) => {
          const raw = getField(interaction, `t_${t}`);
          if (!raw) return null;
          const [duration, costPart = ""] = raw.split("|").map((s) => s.trim());
          const costVal = parseFloat(costPart.replace(/[^0-9.]/g, "") || "0");
          return { option: t, duration, cost: costPart, costVal };
        })
        .filter(Boolean)
        .sort((a, b) => b.costVal - a.costVal);

      const sections = [];
      const cmdSentences = [];
      for (const { option, duration, cost } of entries) {
        const emoji = TRAVEL_EMOJIS[option.toLowerCase()] || "🗺️";
        const durationLabel =
          TRAVEL_DURATION_LABELS[option.toLowerCase()] || "Duration";
        const cmdSuffix = travelCmdSuffix(option);
        sections.push(
          `## ${emoji}  **__${option.toUpperCase()}__**  ${emoji}\n` +
            `*${durationLabel}: ${duration}*\n` +
            `*Cost: ${cost || "$0"}*`,
        );
        cmdSentences.push(
          `If you would like to ${travelVerb(option)}, use the command \`!${destInitials}-${cmdSuffix}\`.`,
        );
      }

      const tagName = `${destInitials.toLowerCase()}-travel`;
      const travelContent =
        TRAVEL_INFO_HEADER +
        "\n\n" +
        sections.join("\n\n") +
        "\n" +
        TRAVEL_INFO_FOOTER +
        "\n\n" +
        `*${cmdSentences.join(" ")}*`;

      const tagMsg = `**Travel tag (\`!${tagName}\`)**\n\`\`\`\n!tag add ${tagName} ${travelContent}\n\`\`\``;

      if (entries.length > 0) {
        ctx.waitUntil(
          (async () => {
            for (const { option, duration, cost } of entries) {
              const [label, command] = buildIndividualCommand(
                option,
                duration,
                cost,
                destInitials,
              );
              await sendFollowup(
                env,
                interaction.token,
                `**${label}**\n\`\`\`\n${command}\n\`\`\``,
              );
            }
          })(),
        );
      }

      return new JsonResponse({
        type: 4,
        data: { content: tagMsg, flags: 64 },
      });
    }

    case "modal_detour": {
      const leg = parseInt(parts[0]);
      const switchTime = parts.slice(1).join(":") || "";
      const locRaw = getField(interaction, "location");
      const name1 = getField(interaction, "option1_name");
      const desc1 = getField(interaction, "option1_desc");
      const name2 = getField(interaction, "option2_name");
      const desc2 = getField(interaction, "option2_desc");

      const [locationName, locationImage = ""] = locRaw
        .split("|")
        .map((s) => s.trim());

      const cmd1 = name1.toLowerCase().replace(/[^a-z0-9]/g, "");
      const cmd2 = name2.toLowerCase().replace(/[^a-z0-9]/g, "");
      const cmd1Display = cmd1.charAt(0).toUpperCase() + cmd1.slice(1);
      const cmd2Display = cmd2.charAt(0).toUpperCase() + cmd2.slice(1);
      const cmdSwitch = `switch-l${leg}-detour`;
      const cmdSwitchDisplay = `Switch-L${leg}-Detour`;
      const locInitials = getInitials(locationName);
      const tagArrived = `${locInitials.toLowerCase()}-arrived`;
      const tagArrivedDisplay = `${locInitials}-Arrived`;

      const detourTitle = `${name1.toUpperCase()} OR ${name2.toUpperCase()}?`;
      const overviewHeader = `# ⬥ ─── [DETOUR: ${detourTitle}](${DETOUR_HEADER_IMAGE}) ───⬥`;
      const overviewFooter = "# ⬥ " + "─".repeat(`DETOUR: ${detourTitle}`.length + 8) + "⬥";
      const overviewContent =
        overviewHeader + "\n\n" +
        `*Use the commands \`!${cmd1Display}\` and \`!${cmd2Display}\` to view the details of both sides of the detour, and exit ${locationImage ? `[${locationName}](${locationImage})` : locationName} when you are ready. ` +
        `If your team chooses to switch sides of the detour at any point, use the command \`!${cmdSwitchDisplay}\` to travel and begin the other side. ` +
        `Please note that switching will erase all progress, and returning later will require you to start from the beginning.*\n` +
        overviewFooter;

      const opt1Header = `# ⬥ ─── DETOUR: ${name1.toUpperCase()} ───⬥`;
      const opt1Footer =
        "# ⬥ " + "─".repeat(`DETOUR: ${name1}`.length + 8) + "⬥";
      const opt1Content =
        opt1Header +
        "\n\n" +
        `*${desc1}*\n\n` +
        `*If you would like to switch, use the command \`!${cmdSwitchDisplay}\`.*\n` +
        opt1Footer;

      const opt2Header = `# ⬥ ─── DETOUR: ${name2.toUpperCase()} ───⬥`;
      const opt2Footer =
        "# ⬥ " + "─".repeat(`DETOUR: ${name2}`.length + 8) + "⬥";
      const opt2Content =
        opt2Header +
        "\n\n" +
        `*${desc2}*\n\n` +
        `*If you would like to switch, use the command \`!${cmdSwitchDisplay}\`.*\n` +
        opt2Footer;

      const switchContent = switchTime
        ? `*You will travel **${switchTime}** to the other detour. If you would like to switch, use the arrival command of the other detour.*`
        : `*If you would like to switch, use the arrival command of the other detour.*`;

      const msgs = [
        `**TAG 1 of 4 — Detour arrival (\`!${tagArrivedDisplay}\`)**\n\`\`\`\n!tag add ${tagArrived} ${overviewContent}\n\`\`\``,
        `**TAG 2 of 4 — Option 1: ${name1} (\`!${cmd1Display}\`)**\n\`\`\`\n!tag add ${cmd1} ${opt1Content}\n\`\`\``,
        `**TAG 3 of 4 — Option 2: ${name2} (\`!${cmd2Display}\`)**\n\`\`\`\n!tag add ${cmd2} ${opt2Content}\n\`\`\``,
        `**TAG 4 of 4 — Switch (\`!${cmdSwitchDisplay}\`)**\n\`\`\`\n!tag add ${cmdSwitch} ${switchContent}\n\`\`\``,
      ];

      ctx.waitUntil(
        (async () => {
          for (const msg of msgs.slice(1)) {
            await sendFollowup(env, interaction.token, msg);
          }
        })(),
      );

      return new JsonResponse({
        type: 4,
        data: { content: msgs[0], flags: 64 },
      });
    }

    default:
      return new JsonResponse({ error: "Unknown modal" }, { status: 400 });
  }
}
