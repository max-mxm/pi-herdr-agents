# Installer Pi Herdr Agents avec Herdr Desktop

Cette version adapte [Pi Herdr Agents](https://github.com/giuseppecrj/pi-herdr-agents)
à Herdr Desktop. Elle permet à un agent Pi de lancer des sous-agents Pi interactifs
et de recevoir leurs résultats. Le code reste sous licence MIT, avec les crédits
du projet d’origine.

Le dépôt à installer est
[`max-mxm/pi-herdr-agents`](https://github.com/max-mxm/pi-herdr-agents), branche
`feat/herdr-desktop`. Le package `npm:pi-herdr-agents` correspond au projet amont
et ne contient pas cette adaptation Desktop.

## Préparer son poste

Il faut Pi avec le support des packages, Git, Herdr Desktop et la commande `hc`.
Les enfants sont lancés avec `/bin/bash`. L’environnement observé chez le
mainteneur est macOS, Node.js 26.7.0, Pi 1.5.0, `hc` 0.1.18 et Herdr Desktop
0.1.13. Cela ne garantit pas toutes les autres combinaisons de versions ; Windows
natif et les terminaux Desktop distants ne sont pas vérifiés.

Dans un terminal ouvert **dans Herdr Desktop**, vérifier les versions et la
présence du contexte Desktop :

```bash
node --version
pi --version
hc --version
herdr-app --version
printenv HC_TERMINAL_ID
printenv HERDR_ENV
```

`HC_TERMINAL_ID` doit être fourni par Herdr, par exemple `t7`. `HERDR_ENV` ne doit
pas valoir `1` dans ce mode : cette valeur sélectionne l’ancien Herdr. Si elle
est héritée d’une configuration destinée à l’ancien Herdr, utiliser `unset HERDR_ENV`
dans ce terminal avant de relancer Pi. Ne pas inventer un identifiant de terminal.

## Installer dans le bon profil Pi

Si tu utilises un profil personnalisé, définir `PI_CODING_AGENT_DIR` avec son
chemin existant avant l’installation. Sans profil personnalisé, Pi utilise son
dossier utilisateur habituel. Les commandes d’installation et la session Pi
doivent utiliser le même profil.

Si l’extension amont est déjà installée depuis npm, retirer uniquement cette copie :

```bash
pi remove npm:pi-herdr-agents
```

Si l’ancienne source est un chemin local ou une URL Git, retirer cette source
précise. Conserver les autres packages, les accès et les sessions. Une seule copie
de Pi Herdr Agents doit être chargée, y compris entre packages globaux et locaux
au projet.

Installer ensuite cette version :

```bash
pi install git:https://github.com/max-mxm/pi-herdr-agents.git@feat/herdr-desktop
```

Ouvrir Pi dans le dossier du projet depuis Herdr Desktop, ou saisir `/reload`
dans une session existante après l’installation.

Il faut aussi configurer **ses propres accès** dans Pi et sélectionner un modèle
utilisable. Vérifier d’abord qu’une demande simple fonctionne dans le parent.
L’extension ne fournit ni compte, ni clé, ni rôle nommé. Le cockpit personnalisé
et les profils d’équipe du mainteneur sont indépendants de ce package.

## Première délégation

Dans Pi, charger `/skill:pi-herdr-agents`, puis demander par exemple :

```text
Lance un seul sous-agent ordinaire, sans rôle nommé et sans worktree géré.
Demande-lui de répondre DESKTOP_OK sans créer ni modifier de fichier.
Attends la livraison automatique de son résultat.
```

Le sous-agent doit apparaître dans Herdr Desktop et son résultat doit revenir
dans le parent. Un terminal enfant marqué « terminé » ne suffit pas à démontrer
que le parent a reçu le résultat. Cette vérification porte uniquement sur la
délégation, pas sur les fonctionnalités de ton application.

## Limites actuelles

- Le transport Desktop est expérimental et local.
- La création, l’inventaire et la suppression des worktrees **gérés par
  l’extension**, ainsi que leur handoff interactif, ne sont pas pris en charge.
  On peut préparer un worktree séparément puis donner son chemin comme `cwd`
  d’un sous-agent ordinaire. L’extension ne gère alors pas ce worktree.
- Les placements en groupes d’onglets et les réglages de panneaux de l’ancien
  Herdr ne sont pas implémentés dans le transport Desktop.
- Les connexions aux services externes dépendent des accès de chaque poste.

## Si quelque chose ne fonctionne pas

| Symptôme | Vérification utile |
| --- | --- |
| Pi demande `HERDR_ENV` ou utilise `herdr` au lieu de `hc` | Vérifier la source installée, le profil actif, `HC_TERMINAL_ID` et une éventuelle valeur héritée `HERDR_ENV=1`. |
| Outil `subagent` absent ou chargé en double | Recharger Pi, vérifier qu’une seule copie est sélectionnée et que l’installation utilise le même profil que la session. |
| Le parent fonctionne mais l’enfant échoue à s’authentifier | Vérifier le profil de l’enfant et les références de variables d’environnement dans `models.json`. Le transport transmet les variables référencées présentes dans le parent. Les valeurs ne doivent pas être copiées dans une issue ou un journal. |
| Un rôle nommé est introuvable | Ce package ne fournit pas de rôles. Commencer par un enfant sans rôle nommé ou installer les définitions de son équipe. |
| Une opération sur les worktrees est refusée | C’est une limite Desktop documentée. Préparer le worktree séparément et utiliser son `cwd`. |
| L’enfant termine mais aucun résultat ne revient | Examiner l’erreur et la livraison du résultat dans la session parent ; ne pas se fier uniquement au statut du terminal. |

Le [guide technique Desktop](desktop.md) décrit le transport, les accès et les
scénarios déjà couverts. Le [guide de dépannage](troubleshooting.md) détaille
la livraison des résultats.

## Faire diagnostiquer un problème par son assistant IA

Pour modifier le code, cloner le dépôt dans un dossier de développement :

```bash
git clone https://github.com/max-mxm/pi-herdr-agents.git
cd pi-herdr-agents
git switch feat/herdr-desktop
```

Retirer la source Git installée du profil concerné, puis installer le chemin
absolu de ce clone avec `pi install /chemin/absolu/pi-herdr-agents`. Recharger Pi
et conserver le clone tant qu’il est utilisé. Éviter de modifier directement le
cache d’installation de Pi : ces changements seraient difficiles à retrouver.

On peut donner cette consigne à son assistant :

```text
Diagnostique mon installation de ce fork Pi Herdr Agents avec Herdr Desktop.
Lis AGENTS.md, docs/desktop-install.fr.md et docs/desktop.md dans ce clone.
Commence par le profil actif, la source installée, les versions, PATH,
HC_TERMINAL_ID et HERDR_ENV, puis reproduis l’échec précis.
Ne révèle aucune clé ni aucun fichier d’authentification.
Ne configure pas HERDR_ENV=1 pour contourner un problème Desktop.
Si une correction de code est nécessaire, travaille dans ce clone sur une branche
dédiée et limite le changement à la cause reproduite. Respecte les accès et les
sessions existants ; ne termine pas de terminaux sans rapport avec le diagnostic.
Décris la cause, les fichiers modifiés et les vérifications réellement effectuées.
```

Pour signaler un problème au mainteneur, ouvrir une
[issue sur ce dépôt](https://github.com/max-mxm/pi-herdr-agents/issues) avec les
versions, le mode d’installation, les étapes et l’erreur expurgée. Ne pas joindre
de conversation privée complète, de clé ou de configuration d’accès réelle.

## Mettre à jour ou revenir en arrière

Relancer la commande d’installation Git puis `/reload` pour sélectionner la
révision courante de `feat/herdr-desktop`. Un SHA complet peut remplacer le nom
de branche pour figer une révision. Les enfants déjà lancés ne sont pas mis à
jour rétroactivement.

Pour revenir en arrière, retirer la source actuelle, réinstaller la source ou
la révision précédente et recharger Pi. Les sessions, les accès et les worktrees
existants restent à conserver.
