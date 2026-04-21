'use client';

import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Toaster } from '@/components/ui/sonner';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

interface ColorToken {
  name: string;
  hex: string;
  utility: string;
  textOn: 'light' | 'dark';
}

interface ColorGroup {
  title: string;
  subtitle: string;
  tokens: ColorToken[];
}

const COLOR_GROUPS: ColorGroup[] = [
  {
    title: 'Primary — Navy',
    subtitle: 'Trust, authority, structural surfaces (sidebar, headers, hero)',
    tokens: [
      { name: '--ifa-navy-900', hex: '#0F1A2E', utility: 'bg-ifa-navy-900', textOn: 'dark' },
      { name: '--ifa-navy-800', hex: '#1B2D4A', utility: 'bg-ifa-navy-800', textOn: 'dark' },
      { name: '--ifa-navy-700', hex: '#264573', utility: 'bg-ifa-navy-700', textOn: 'dark' },
      { name: '--ifa-navy-600', hex: '#2E5A8F', utility: 'bg-ifa-navy-600', textOn: 'dark' },
      { name: '--ifa-navy-100', hex: '#E8EEF6', utility: 'bg-ifa-navy-100', textOn: 'light' },
      { name: '--ifa-navy-50', hex: '#F4F7FB', utility: 'bg-ifa-navy-50', textOn: 'light' },
    ],
  },
  {
    title: 'Secondary — Teal',
    subtitle: 'Innovation, action, positive trends (buttons, links, success)',
    tokens: [
      { name: '--ifa-teal-600', hex: '#0D847A', utility: 'bg-ifa-teal-600', textOn: 'dark' },
      { name: '--ifa-teal-500', hex: '#0FA698', utility: 'bg-ifa-teal-500', textOn: 'dark' },
      { name: '--ifa-teal-400', hex: '#2EC4B6', utility: 'bg-ifa-teal-400', textOn: 'dark' },
      { name: '--ifa-teal-100', hex: '#D1F5F0', utility: 'bg-ifa-teal-100', textOn: 'light' },
    ],
  },
  {
    title: 'Accent — Gold',
    subtitle: 'Prosperity, achievement (badges, streaks, premium)',
    tokens: [
      { name: '--ifa-gold-500', hex: '#D4A843', utility: 'bg-ifa-gold-500', textOn: 'dark' },
      { name: '--ifa-gold-400', hex: '#E5C06E', utility: 'bg-ifa-gold-400', textOn: 'dark' },
      { name: '--ifa-gold-100', hex: '#FDF5E3', utility: 'bg-ifa-gold-100', textOn: 'light' },
    ],
  },
  {
    title: 'Semantic',
    subtitle: 'State-communicating colors (feedback, alerts, status)',
    tokens: [
      { name: '--ifa-success', hex: '#16A34A', utility: 'bg-ifa-success', textOn: 'dark' },
      { name: '--ifa-warning', hex: '#E5930B', utility: 'bg-ifa-warning', textOn: 'dark' },
      { name: '--ifa-error', hex: '#DC2626', utility: 'bg-ifa-error', textOn: 'dark' },
      { name: '--ifa-info', hex: '#2563EB', utility: 'bg-ifa-info', textOn: 'dark' },
    ],
  },
  {
    title: 'Neutral',
    subtitle: 'Text, borders, alternating rows, surfaces',
    tokens: [
      { name: '--ifa-gray-900', hex: '#111827', utility: 'bg-ifa-gray-900', textOn: 'dark' },
      { name: '--ifa-gray-700', hex: '#374151', utility: 'bg-ifa-gray-700', textOn: 'dark' },
      { name: '--ifa-gray-500', hex: '#6B7280', utility: 'bg-ifa-gray-500', textOn: 'dark' },
      { name: '--ifa-gray-300', hex: '#D1D5DB', utility: 'bg-ifa-gray-300', textOn: 'light' },
      { name: '--ifa-gray-100', hex: '#F3F4F6', utility: 'bg-ifa-gray-100', textOn: 'light' },
      {
        name: '--ifa-white',
        hex: '#FFFFFF',
        utility: 'bg-ifa-white border border-ifa-gray-300',
        textOn: 'light',
      },
    ],
  },
];

const RADII: { name: string; utility: string; value: string }[] = [
  { name: '--radius-ifa-card', utility: 'rounded-ifa-card', value: '8px' },
  { name: '--radius-ifa-button', utility: 'rounded-ifa-button', value: '6px' },
  { name: '--radius-ifa-input', utility: 'rounded-ifa-input', value: '6px' },
  { name: '--radius-ifa-pill', utility: 'rounded-ifa-pill', value: '9999px' },
];

const SHADOWS: { name: string; utility: string; description: string }[] = [
  {
    name: '--shadow-ifa-card',
    utility: 'shadow-ifa-card',
    description: 'Default elevation for cards and surfaces',
  },
  {
    name: '--shadow-ifa-modal',
    utility: 'shadow-ifa-modal',
    description: 'High elevation for modals and overlays',
  },
  {
    name: '--shadow-ifa-dropdown',
    utility: 'shadow-ifa-dropdown',
    description: 'Medium elevation for dropdowns and menus',
  },
];

function Swatch({ token }: { token: ColorToken }) {
  const textClass = token.textOn === 'dark' ? 'text-ifa-white' : 'text-ifa-gray-900';
  return (
    <div className="rounded-ifa-card shadow-ifa-card overflow-hidden">
      <div className={`${token.utility} ${textClass} flex h-24 items-end p-3`}>
        <code className="font-mono text-xs">{token.utility}</code>
      </div>
      <div className="bg-ifa-white p-3">
        <div className="text-ifa-gray-900 font-mono text-xs">{token.name}</div>
        <div className="text-ifa-gray-500 mt-1 font-mono text-xs uppercase">{token.hex}</div>
      </div>
    </div>
  );
}

const demoFormSchema = z.object({
  nombre: z.string().min(2, { message: 'El nombre debe tener al menos 2 caracteres.' }),
  nit: z
    .string()
    .min(1, { message: 'El NIT es obligatorio.' })
    .regex(/^[0-9]+-?[0-9Kk]?$/, { message: 'Formato de NIT inválido.' }),
});

type DemoFormValues = z.infer<typeof demoFormSchema>;

function DemoForm() {
  const form = useForm<DemoFormValues>({
    resolver: zodResolver(demoFormSchema),
    defaultValues: { nombre: '', nit: '' },
  });

  return (
    <Form {...form}>
      <form
        onSubmit={(event) =>
          void form.handleSubmit(() => {
            form.reset();
          })(event)
        }
        className="grid w-full max-w-md gap-4"
      >
        <FormField
          control={form.control}
          name="nombre"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nombre de la empresa</FormLabel>
              <FormControl>
                <Input placeholder="Panadería La Antigua, S.A." {...field} />
              </FormControl>
              <FormDescription>Así aparecerá en tus reportes.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="nit"
          render={({ field }) => (
            <FormItem>
              <FormLabel>NIT</FormLabel>
              <FormControl>
                <Input placeholder="12345678-9" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" className="justify-self-start">
          Guardar
        </Button>
      </form>
    </Form>
  );
}

function PrimitiveBlock({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-ifa-card bg-ifa-white shadow-ifa-card p-5">
      <h3 className="text-ifa-navy-900 font-semibold">{title}</h3>
      <p className="text-ifa-gray-500 mt-1 mb-4 text-sm">{description}</p>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </div>
  );
}

export default function DesignSystemPage() {
  if (process.env.NODE_ENV !== 'development') {
    notFound();
  }

  const totalTokens = COLOR_GROUPS.reduce((acc, group) => acc + group.tokens.length, 0);

  return (
    <TooltipProvider>
      <main className="bg-ifa-navy-50 min-h-dvh px-6 py-10">
        <div className="mx-auto max-w-6xl">
          <header className="mb-10">
            <h1 className="text-ifa-navy-900 text-3xl font-bold tracking-tight">
              IFA Design System — Confianza
            </h1>
            <p className="text-ifa-gray-700 mt-2">
              Source of truth:{' '}
              <code className="font-mono text-sm">docs/genesis_docs/_IFA_SCAFFOLDING.md §5</code>.
              This page is dev-only and returns 404 in production.
            </p>
            <p className="text-ifa-gray-500 mt-1 text-sm">
              {totalTokens} color tokens · {RADII.length} radii · {SHADOWS.length} shadows · 25
              shadcn primitives
            </p>
          </header>

          <section className="mb-12 space-y-10">
            <h2 className="text-ifa-navy-900 text-xl font-semibold">Colors</h2>
            {COLOR_GROUPS.map((group) => (
              <div key={group.title}>
                <h3 className="text-ifa-navy-800 text-lg font-semibold">{group.title}</h3>
                <p className="text-ifa-gray-500 mb-4 text-sm">{group.subtitle}</p>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
                  {group.tokens.map((token) => (
                    <Swatch key={token.name} token={token} />
                  ))}
                </div>
              </div>
            ))}
          </section>

          <section className="mb-12">
            <h2 className="text-ifa-navy-900 mb-4 text-xl font-semibold">Border radii</h2>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {RADII.map((r) => (
                <div
                  key={r.name}
                  className="bg-ifa-white shadow-ifa-card rounded-ifa-card p-4 text-center"
                >
                  <div className={`bg-ifa-navy-700 mx-auto h-16 w-16 ${r.utility}`} aria-hidden />
                  <div className="text-ifa-gray-900 mt-3 font-mono text-xs">{r.utility}</div>
                  <div className="text-ifa-gray-500 font-mono text-xs">{r.value}</div>
                </div>
              ))}
            </div>
          </section>

          <section className="mb-12">
            <h2 className="text-ifa-navy-900 mb-4 text-xl font-semibold">Elevation (shadows)</h2>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
              {SHADOWS.map((s) => (
                <div key={s.name} className={`bg-ifa-white rounded-ifa-card p-6 ${s.utility}`}>
                  <div className="text-ifa-gray-900 font-mono text-xs">{s.utility}</div>
                  <div className="text-ifa-gray-500 mt-1 text-sm">{s.description}</div>
                </div>
              ))}
            </div>
          </section>

          <section className="mb-12">
            <h2 className="text-ifa-navy-900 mb-4 text-xl font-semibold">Focus ring</h2>
            <p className="text-ifa-gray-700 mb-4 text-sm">
              Tab into the button below to see the global{' '}
              <code className="font-mono">:focus-visible</code> ring: 2px solid{' '}
              <code className="font-mono">--ifa-teal-500</code>, 2px offset.
            </p>
            <button
              type="button"
              className="bg-ifa-navy-700 text-ifa-white hover:bg-ifa-navy-600 rounded-ifa-button px-5 py-2 text-sm font-medium transition-colors"
            >
              Hazme foco con Tab
            </button>
          </section>

          <section className="space-y-6">
            <h2 className="text-ifa-navy-900 text-xl font-semibold">shadcn primitives</h2>

            <PrimitiveBlock title="Button" description="Variants and sizes">
              <Button>Default</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="destructive">Destructive</Button>
              <Button variant="outline">Outline</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="link">Link</Button>
              <Separator orientation="vertical" className="h-8" />
              <Button size="sm">sm</Button>
              <Button size="default">default</Button>
              <Button size="lg">lg</Button>
              <Button disabled>Disabled</Button>
            </PrimitiveBlock>

            <PrimitiveBlock title="Badge" description="Status and category indicators">
              <Badge>Default</Badge>
              <Badge variant="secondary">Secondary</Badge>
              <Badge variant="destructive">Destructive</Badge>
              <Badge variant="outline">Outline</Badge>
            </PrimitiveBlock>

            <PrimitiveBlock title="Alert" description="Inline status with title and description">
              <div className="w-full space-y-3">
                <Alert>
                  <AlertTitle>Informativo</AlertTitle>
                  <AlertDescription>Esta es la variante por defecto.</AlertDescription>
                </Alert>
                <Alert variant="destructive">
                  <AlertTitle>Error</AlertTitle>
                  <AlertDescription>Algo no salió como esperábamos.</AlertDescription>
                </Alert>
              </div>
            </PrimitiveBlock>

            <PrimitiveBlock title="Input + Label" description="Labeled text field">
              <div className="grid w-full max-w-sm gap-1.5">
                <Label htmlFor="ds-email">Correo electrónico</Label>
                <Input id="ds-email" type="email" placeholder="tu@empresa.gt" />
              </div>
            </PrimitiveBlock>

            <PrimitiveBlock title="Textarea" description="Multi-line input">
              <div className="grid w-full max-w-sm gap-1.5">
                <Label htmlFor="ds-notes">Notas</Label>
                <Textarea id="ds-notes" placeholder="Escribe aquí..." rows={3} />
              </div>
            </PrimitiveBlock>

            <PrimitiveBlock title="Select" description="Dropdown list">
              <Select>
                <SelectTrigger className="w-[220px]">
                  <SelectValue placeholder="Elige un régimen fiscal" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="general">Régimen General</SelectItem>
                  <SelectItem value="pequeno">Pequeño Contribuyente</SelectItem>
                  <SelectItem value="especial">Régimen Especial</SelectItem>
                </SelectContent>
              </Select>
            </PrimitiveBlock>

            <PrimitiveBlock title="Checkbox" description="Boolean input">
              <div className="flex items-center gap-2">
                <Checkbox id="ds-terms" />
                <Label htmlFor="ds-terms">Acepto los términos</Label>
              </div>
            </PrimitiveBlock>

            <PrimitiveBlock title="Radio Group" description="Single selection from a set">
              <RadioGroup defaultValue="card" className="flex gap-4">
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="card" id="ds-r-card" />
                  <Label htmlFor="ds-r-card">Tarjeta</Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="transfer" id="ds-r-xfer" />
                  <Label htmlFor="ds-r-xfer">Transferencia</Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="cash" id="ds-r-cash" />
                  <Label htmlFor="ds-r-cash">Efectivo</Label>
                </div>
              </RadioGroup>
            </PrimitiveBlock>

            <PrimitiveBlock title="Switch" description="Binary toggle">
              <div className="flex items-center gap-2">
                <Switch id="ds-mfa" />
                <Label htmlFor="ds-mfa">Activar autenticación en dos pasos</Label>
              </div>
            </PrimitiveBlock>

            <PrimitiveBlock title="Avatar" description="User/org visual identity">
              <Avatar>
                <AvatarFallback>JC</AvatarFallback>
              </Avatar>
              <Avatar>
                <AvatarFallback>PA</AvatarFallback>
              </Avatar>
              <Avatar>
                <AvatarFallback className="bg-ifa-teal-500 text-ifa-white">IF</AvatarFallback>
              </Avatar>
            </PrimitiveBlock>

            <PrimitiveBlock title="Card" description="Grouped content surface">
              <Card className="w-full max-w-sm">
                <CardHeader>
                  <CardTitle>Puntaje de Salud Financiera</CardTitle>
                  <CardDescription>Basado en 7 factores de tu negocio</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="font-mono text-4xl font-semibold">780</div>
                  <div className="text-ifa-gray-500 text-sm">Saludable · +40 vs. mes anterior</div>
                </CardContent>
                <CardFooter>
                  <Button variant="outline" size="sm">
                    Ver detalle
                  </Button>
                </CardFooter>
              </Card>
            </PrimitiveBlock>

            <PrimitiveBlock title="Separator" description="Visual divider (horizontal / vertical)">
              <div className="w-full">
                <div className="flex items-center gap-3 text-sm">
                  <span>Inicio</span>
                  <Separator orientation="vertical" className="h-5" />
                  <span>Transacciones</span>
                  <Separator orientation="vertical" className="h-5" />
                  <span>Reportes</span>
                </div>
                <Separator className="my-4" />
                <p className="text-ifa-gray-500 text-sm">Contenido debajo de un separador.</p>
              </div>
            </PrimitiveBlock>

            <PrimitiveBlock title="Skeleton" description="Loading placeholder">
              <div className="w-full max-w-sm space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-24 w-full" />
              </div>
            </PrimitiveBlock>

            <PrimitiveBlock title="Progress" description="Determinate progress bar">
              <div className="w-full max-w-sm space-y-3">
                <Progress value={25} />
                <Progress value={50} />
                <Progress value={75} />
                <Progress value={100} />
              </div>
            </PrimitiveBlock>

            <PrimitiveBlock title="Tabs" description="Section switcher">
              <Tabs defaultValue="resumen" className="w-full max-w-md">
                <TabsList>
                  <TabsTrigger value="resumen">Resumen</TabsTrigger>
                  <TabsTrigger value="detalle">Detalle</TabsTrigger>
                  <TabsTrigger value="historial">Historial</TabsTrigger>
                </TabsList>
                <TabsContent value="resumen" className="text-ifa-gray-700 pt-3 text-sm">
                  Vista resumida de la transacción.
                </TabsContent>
                <TabsContent value="detalle" className="text-ifa-gray-700 pt-3 text-sm">
                  Detalle completo: DTE, tarjeta, conciliación.
                </TabsContent>
                <TabsContent value="historial" className="text-ifa-gray-700 pt-3 text-sm">
                  Pista de auditoría en orden cronológico.
                </TabsContent>
              </Tabs>
            </PrimitiveBlock>

            <PrimitiveBlock title="Table" description="Tabular data">
              <Table>
                <TableCaption>Ejemplo de tabla de transacciones.</TableCaption>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Descripción</TableHead>
                    <TableHead className="text-right">Monto</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell>2026-04-15</TableCell>
                    <TableCell>Venta FEL — Factura A-0001</TableCell>
                    <TableCell className="text-right font-mono">Q 1,234.56</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>2026-04-15</TableCell>
                    <TableCell>Cargo TPV — BAC Credomatic</TableCell>
                    <TableCell className="text-right font-mono">Q 1,234.56</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </PrimitiveBlock>

            <PrimitiveBlock title="Tooltip" description="Hover / focus explanation">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline">Hazme hover</Button>
                </TooltipTrigger>
                <TooltipContent>Explicación breve en texto inverso.</TooltipContent>
              </Tooltip>
            </PrimitiveBlock>

            <PrimitiveBlock title="Dropdown Menu" description="Menu attached to a trigger">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline">Abrir menú</Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuLabel>Mi cuenta</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem>Perfil</DropdownMenuItem>
                  <DropdownMenuItem>Configuración</DropdownMenuItem>
                  <DropdownMenuItem>Cerrar sesión</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </PrimitiveBlock>

            <PrimitiveBlock title="Dialog" description="Modal focused interaction">
              <Dialog>
                <DialogTrigger asChild>
                  <Button>Abrir diálogo</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>¿Confirmar cierre de periodo?</DialogTitle>
                    <DialogDescription>
                      Una vez cerrado, no podrás agregar nuevos asientos a este mes.
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <Button variant="outline">Cancelar</Button>
                    <Button>Cerrar periodo</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </PrimitiveBlock>

            <PrimitiveBlock title="Sheet" description="Slide-in panel">
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="outline">Abrir panel</Button>
                </SheetTrigger>
                <SheetContent>
                  <SheetHeader>
                    <SheetTitle>Filtros avanzados</SheetTitle>
                    <SheetDescription>
                      Refina la vista de transacciones por fuente, estado y rango.
                    </SheetDescription>
                  </SheetHeader>
                </SheetContent>
              </Sheet>
            </PrimitiveBlock>

            <PrimitiveBlock title="Popover" description="Floating contextual content">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline">Abrir popover</Button>
                </PopoverTrigger>
                <PopoverContent>
                  <div className="text-sm">
                    <div className="text-ifa-navy-900 font-semibold">Tip</div>
                    <p className="text-ifa-gray-700 mt-1">
                      Los popovers se usan para información contextual ligera.
                    </p>
                  </div>
                </PopoverContent>
              </Popover>
            </PrimitiveBlock>

            <PrimitiveBlock title="Command" description="Searchable command palette">
              <Command className="w-full max-w-sm">
                <CommandInput placeholder="Buscar una acción..." />
                <CommandList>
                  <CommandEmpty>Sin resultados.</CommandEmpty>
                  <CommandGroup heading="Navegación">
                    <CommandItem>Ir a Dashboard</CommandItem>
                    <CommandItem>Ir a Transacciones</CommandItem>
                    <CommandItem>Ir a Reportes</CommandItem>
                  </CommandGroup>
                </CommandList>
              </Command>
            </PrimitiveBlock>

            <PrimitiveBlock
              title="Form"
              description="react-hook-form + zod wired to shadcn primitives"
            >
              <DemoForm />
            </PrimitiveBlock>

            <PrimitiveBlock
              title="Toaster (sonner)"
              description="Notificaciones efímeras — ancladas al layout en S-0.15"
            >
              <p className="text-ifa-gray-500 text-sm">
                El componente <code className="font-mono">Toaster</code> se monta al nivel global
                para que cualquier parte de la app pueda invocar{' '}
                <code className="font-mono">toast()</code>. Aquí sólo confirmamos que está
                disponible en esta página.
              </p>
            </PrimitiveBlock>
          </section>

          <Toaster />
        </div>
      </main>
    </TooltipProvider>
  );
}
