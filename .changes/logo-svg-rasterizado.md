---
impacto: capacidade_nova
secao: adicionado
titulo: O logo e o ícone da aba aceitam arquivo SVG
---

Em Configurações › Marca, o campo do logo e o do ícone da aba passaram a aceitar `.svg`, além de PNG, JPEG, GIF e WebP. O SVG é convertido em PNG no próprio servidor no momento do envio, com o lado maior em até 800 px, e é o PNG que fica guardado: o arquivo vetorial nunca é armazenado nem servido, então não há o que executar no navegador de quem abre o CRM. Um SVG com script, conteúdo HTML embutido ou referência a endereço externo é recusado com uma mensagem clara, e o desenho pesado demais para converter também. Nada a fazer ao atualizar.
