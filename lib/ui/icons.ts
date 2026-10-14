/**
 * Canonical icon map. Toda feature importa daqui — nunca direto da biblioteca.
 * ADR-05 (Spec 09 §12): o barril existe para a troca de biblioteca não virar
 * big-bang refactor — e foi o que aconteceu: os NOMES abaixo são o vocabulário
 * do produto (herdado do Phosphor) e ficam; o DESENHO é Lucide.
 *
 * Por que o nome fica: 186 arquivos importam daqui. Renomear todos faria cada
 * atualização com a `main` conflitar; trocar só este arquivo, não.
 *
 * `weight` segue aceito (é o vocabulário que as telas já falam) e vira
 * espessura de traço — o Lucide tem um traço só, sem preenchimento nem duotone.
 * `strokeWidth` explícito vence.
 *
 * Exceção: o Lucide 1.x não desenha logo de marca. WhatsApp, Instagram,
 * Messenger e Google seguem pelo Phosphor (`dist/ssr`, seguro em Server
 * Component) — logo de terceiro não é ícone de UI.
 */
import {
  GoogleLogo as PhosphorGoogleLogo,
  InstagramLogo as PhosphorInstagramLogo,
  MessengerLogo as PhosphorMessengerLogo,
  WhatsappLogo as PhosphorWhatsappLogo,
} from "@phosphor-icons/react/dist/ssr";
import type { Icon as IconeDoPhosphor } from "@phosphor-icons/react";
import * as L from "lucide-react";
import { createElement, type ReactElement } from "react";

export type PesoDoIcone = "thin" | "light" | "regular" | "bold" | "fill" | "duotone";

export type IconeProps = L.LucideProps & { weight?: PesoDoIcone };

export type Icone = ((props: IconeProps) => ReactElement) & { displayName?: string };

const TRACO: Record<PesoDoIcone, number> = {
  thin: 1.25,
  light: 1.5,
  regular: 2,
  duotone: 2,
  bold: 2.5,
  fill: 2.5,
};

function doLucide(Base: L.LucideIcon, nome: string): Icone {
  const Desenho: Icone = ({ weight = "regular", strokeWidth, ...resto }) =>
    createElement(Base, { ...resto, strokeWidth: strokeWidth ?? TRACO[weight] });
  Desenho.displayName = nome;
  return Desenho;
}

function daMarca(Base: IconeDoPhosphor, nome: string): Icone {
  // `strokeWidth`/`absoluteStrokeWidth` são do Lucide; a marca é preenchida.
  const Desenho: Icone = ({ strokeWidth: _s, absoluteStrokeWidth: _a, ...resto }) =>
    createElement(Base, resto);
  Desenho.displayName = nome;
  return Desenho;
}

// navigation
export const Inbox = doLucide(L.Inbox, "Inbox");
export const ListChecks = doLucide(L.ListChecks, "ListChecks");
export const Plugs = doLucide(L.Unplug, "Plugs");
export const PlugsConnected = doLucide(L.PlugZap, "PlugsConnected");
export const QrCode = doLucide(L.QrCode, "QrCode");
export const Kanban = doLucide(L.SquareKanban, "Kanban");
export const Users = doLucide(L.Users, "Users");
export const UsersThree = doLucide(L.UsersRound, "UsersThree");
export const Storefront = doLucide(L.Store, "Storefront");
export const Robot = doLucide(L.Bot, "Robot");
export const Sparkle = doLucide(L.Sparkle, "Sparkle");
export const ShieldCheck = doLucide(L.ShieldCheck, "ShieldCheck");
export const Gear = doLucide(L.Settings, "Gear");
export const House = doLucide(L.House, "House");
// admin platform
export const Buildings = doLucide(L.Building2, "Buildings");
export const FlowArrow = doLucide(L.Workflow, "FlowArrow");
export const ChatsCircle = doLucide(L.MessagesSquare, "ChatsCircle");
export const ClipboardText = doLucide(L.ClipboardList, "ClipboardText");
export const Scales = doLucide(L.Scale, "Scales");
export const Gauge = doLucide(L.Gauge, "Gauge");
export const WifiSlash = doLucide(L.WifiOff, "WifiSlash");
export const Clock = doLucide(L.Clock, "Clock");
// marca da instalação (o revendedor troca nome e cor do produto)
export const Palette = doLucide(L.Palette, "Palette");
// anúncios (Análise → Meta Ads). Megaphone e não outro ChartX: os dois
// vizinhos do grupo já são gráficos (ChartBar em Desempenho, ChartLineUp em
// Evolução da IA), e um terceiro gráfico deixaria as três linhas do menu
// indistinguíveis de relance.
export const Megaphone = doLucide(L.Megaphone, "Megaphone");
// health dashboard
export const WifiHigh = doLucide(L.Wifi, "WifiHigh");
export const Brain = doLucide(L.Brain, "Brain");
export const ArrowsClockwise = doLucide(L.RefreshCw, "ArrowsClockwise");
export const Dot = doLucide(L.Dot, "Dot");
// actions
export const ArrowBendUpLeft = doLucide(L.Reply, "ArrowBendUpLeft");
// videochamada (#2440): ícone de câmera (o `Video` do Lucide), não de player
// — junto do Phone do DialButton, a família é a mesma.
export const VideoCamera = doLucide(L.Video, "VideoCamera");
export const List = doLucide(L.Menu, "List");
export const Bell = doLucide(L.Bell, "Bell");
export const BellSlash = doLucide(L.BellOff, "BellSlash");
export const EnvelopeSimple = doLucide(L.Mail, "EnvelopeSimple");
export const PaperPlaneTilt = doLucide(L.Send, "PaperPlaneTilt");
export const Smiley = doLucide(L.Smile, "Smiley");
export const Check = doLucide(L.Check, "Check");
export const Checks = doLucide(L.CheckCheck, "Checks");
export const X = doLucide(L.X, "X");
export const Plus = doLucide(L.Plus, "Plus");
export const Trash = doLucide(L.Trash2, "Trash");
export const PencilSimple = doLucide(L.Pencil, "PencilSimple");
export const MagnifyingGlass = doLucide(L.Search, "MagnifyingGlass");
export const Pause = doLucide(L.Pause, "Pause");
export const Play = doLucide(L.Play, "Play");
export const SkipForward = doLucide(L.SkipForward, "SkipForward");
export const Copy = doLucide(L.Copy, "Copy");
export const DownloadSimple = doLucide(L.Download, "DownloadSimple");
export const Archive = doLucide(L.Archive, "Archive");
// origem de uma captação de formulário (página, IP, link para o lead)
export const Globe = doLucide(L.Globe, "Globe");
export const ArrowSquareOut = doLucide(L.ExternalLink, "ArrowSquareOut");
export const Tray = doLucide(L.Inbox, "Tray");
// feedback
export const CheckCircle = doLucide(L.CircleCheck, "CheckCircle");
export const Warning = doLucide(L.TriangleAlert, "Warning");
export const WarningOctagon = doLucide(L.OctagonAlert, "WarningOctagon");
export const Info = doLucide(L.Info, "Info");
export const CircleNotch = doLucide(L.LoaderCircle, "CircleNotch");
// lgpd
export const ScalesSimple = doLucide(L.Scale, "ScalesSimple");
export const Eye = doLucide(L.Eye, "Eye");
export const EyeSlash = doLucide(L.EyeOff, "EyeSlash");
export const ChartBar = doLucide(L.ChartColumn, "ChartBar");
export const ClockCountdown = doLucide(L.Timer, "ClockCountdown");
// painéis de evolução / aprendizado
export const ChartLineUp = doLucide(L.TrendingUp, "ChartLineUp");
export const Lightbulb = doLucide(L.Lightbulb, "Lightbulb");
// theme
export const Sun = doLucide(L.Sun, "Sun");
export const Moon = doLucide(L.Moon, "Moon");
export const MonitorPlay = doLucide(L.Monitor, "MonitorPlay");
// conversation
export const ChatCircle = doLucide(L.MessageCircle, "ChatCircle");
export const WhatsappLogo = daMarca(PhosphorWhatsappLogo, "WhatsappLogo");
export const InstagramLogo = daMarca(PhosphorInstagramLogo, "InstagramLogo");
export const MessengerLogo = daMarca(PhosphorMessengerLogo, "MessengerLogo");
export const Phone = doLucide(L.Phone, "Phone");
export const PhoneIncoming = doLucide(L.PhoneIncoming, "PhoneIncoming");
export const PhoneOutgoing = doLucide(L.PhoneOutgoing, "PhoneOutgoing");
export const PhoneX = doLucide(L.PhoneOff, "PhoneX");
export const Paperclip = doLucide(L.Paperclip, "Paperclip");
export const Microphone = doLucide(L.Mic, "Microphone");
export const MicrophoneSlash = doLucide(L.MicOff, "MicrophoneSlash");
export const ImageIcon = doLucide(L.Image, "ImageIcon");
export const ImageSquare = doLucide(L.Images, "ImageSquare");
export const MusicNote = doLucide(L.Music, "MusicNote");
export const Note = doLucide(L.StickyNote, "Note");
export const FileText = doLucide(L.FileText, "FileText");
export const Lock = doLucide(L.Lock, "Lock");
export const LockOpen = doLucide(L.LockOpen, "LockOpen");
export const Receipt = doLucide(L.Receipt, "Receipt");
export const Tag = doLucide(L.Tag, "Tag");
export const Question = doLucide(L.CircleQuestionMark, "Question");
export const Keyboard = doLucide(L.Keyboard, "Keyboard");
// followup flow builder (Task 6.2)
export const GitBranch = doLucide(L.GitBranch, "GitBranch");
export const Flag = doLucide(L.Flag, "Flag");
export const TreeStructure = doLucide(L.Network, "TreeStructure");
// misc
export const DotsThree = doLucide(L.Ellipsis, "DotsThree");
export const CaretDown = doLucide(L.ChevronDown, "CaretDown");
export const CaretUp = doLucide(L.ChevronUp, "CaretUp");
export const CaretDoubleLeft = doLucide(L.ChevronsLeft, "CaretDoubleLeft");
export const CaretDoubleRight = doLucide(L.ChevronsRight, "CaretDoubleRight");
export const CaretLeft = doLucide(L.ChevronLeft, "CaretLeft");
export const CaretRight = doLucide(L.ChevronRight, "CaretRight");
export const ArrowRight = doLucide(L.ArrowRight, "ArrowRight");
export const SignOut = doLucide(L.LogOut, "SignOut");
export const WebhooksLogo = doLucide(L.Webhook, "WebhooksLogo");
export const PuzzlePiece = doLucide(L.Puzzle, "PuzzlePiece");
export const UploadSimple = doLucide(L.Upload, "UploadSimple");
export const Signpost = doLucide(L.Signpost, "Signpost");
// atualização de versão
export const ArrowCircleUp = doLucide(L.CircleArrowUp, "ArrowCircleUp");
// navegação agrupada (registro em lib/navigation/registry.ts)
export const Funnel = doLucide(L.Funnel, "Funnel");
export const BookOpen = doLucide(L.BookOpen, "BookOpen");
export const Key = doLucide(L.KeyRound, "Key");
export const UserCircle = doLucide(L.CircleUser, "UserCircle");
export const ClockCounterClockwise = doLucide(L.History, "ClockCounterClockwise");
// inbox no celular: voltar para a lista e abrir a ficha do contato
export const IdentificationCard = doLucide(L.IdCard, "IdentificationCard");
// agenda (o barril não tinha NENHUM ícone de calendário até aqui)
export const CalendarBlank = doLucide(L.Calendar, "CalendarBlank");
export const CalendarDots = doLucide(L.CalendarDays, "CalendarDots");
export const CalendarPlus = doLucide(L.CalendarPlus, "CalendarPlus");
export const CalendarX = doLucide(L.CalendarX, "CalendarX");
export const CalendarCheck = doLucide(L.CalendarCheck, "CalendarCheck");
export const GoogleLogo = daMarca(PhosphorGoogleLogo, "GoogleLogo");
export const MapPin = doLucide(L.MapPin, "MapPin");
export const ArrowsOutSimple = doLucide(L.Maximize2, "ArrowsOutSimple");
// /admin/modulos: módulo opcional com tabela própria (ADR-0002)
export const Stack = doLucide(L.Layers, "Stack");
// estados vazios (components/empty/variants.tsx)
export const ListMagnifyingGlass = doLucide(L.ListFilter, "ListMagnifyingGlass");
export const ArrowsLeftRight = doLucide(L.ArrowLeftRight, "ArrowsLeftRight");
